use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::AppHandle;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tracing::{info, warn};

use crate::error::AppError;
use crate::logging::rotation::{LogManager, LogStream};
use super::config::RcloneConfig;
use super::rc_client::RcClient;

// ─── State Types ────────────────────────────────────────────────────────────

/// Current status of the rclone daemon process.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum DaemonStatus {
    /// Not running, ready to start.
    Idle,
    /// Process spawned, waiting for RC API to become available.
    Starting,
    /// Running and healthy — RC API confirmed responsive.
    Running,
    /// Graceful shutdown in progress.
    Stopping,
    /// Process exited unexpectedly or failed to start.
    Crashed { message: String },
}

/// Observable state of the rclone daemon, exposed to the frontend.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DaemonState {
    pub status: DaemonStatus,
    pub pid: Option<u32>,
    pub started_at: Option<DateTime<Utc>>,
    pub started_by_app: bool,
    pub active_profile_id: Option<String>,
}

impl Default for DaemonState {
    fn default() -> Self {
        Self {
            status: DaemonStatus::Idle,
            pid: None,
            started_at: None,
            started_by_app: false,
            active_profile_id: None,
        }
    }
}

/// Mount status as determined by querying the RC API.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum MountStatus {
    Mounted,
    RcOnlineMountNotListed,
    RcOffline,
}

// ─── Daemon Manager ─────────────────────────────────────────────────────────

/// Manages the rclone background process lifecycle using Tauri's sidecar system.
///
/// Step 2 evolution: replaces direct `tokio::process::Command` with
/// `app_handle.shell().sidecar("binaries/rclone")` for zero-dependency deployment.
pub struct DaemonManager {
    /// Tauri app handle for sidecar resolution.
    app_handle: AppHandle,
    /// Current rclone configuration (set when a profile is mounted).
    config: parking_lot::RwLock<RcloneConfig>,
    /// RC API HTTP client.
    rc_client: parking_lot::RwLock<RcClient>,
    /// Observable daemon state.
    state: Arc<parking_lot::RwLock<DaemonState>>,
    /// Managed log rotation engine.
    log_manager: Arc<LogManager>,
    /// Handle to the sidecar child process, if running.
    child_handle: tokio::sync::Mutex<Option<CommandChild>>,
}

impl DaemonManager {
    /// Create a new DaemonManager.
    ///
    /// Does NOT start rclone — call `start()` explicitly (matching the plan's
    /// "explicit start" decision).
    pub fn new(
        app_handle: AppHandle,
        config: RcloneConfig,
        rc_client: RcClient,
        log_manager: Arc<LogManager>,
    ) -> Self {
        Self {
            app_handle,
            config: parking_lot::RwLock::new(config),
            rc_client: parking_lot::RwLock::new(rc_client),
            state: Arc::new(parking_lot::RwLock::new(DaemonState::default())),
            log_manager,
            child_handle: tokio::sync::Mutex::new(None),
        }
    }

    /// Get the current daemon state (for the frontend).
    pub fn state(&self) -> DaemonState {
        self.state.read().clone()
    }

    /// Get a reference to the RC client.
    pub fn rc_client(&self) -> RcClient {
        self.rc_client.read().clone()
    }

    /// Get a clone of the current config.
    pub fn config(&self) -> RcloneConfig {
        self.config.read().clone()
    }

    /// Update the config and RC client for a new profile.
    pub fn set_config(&self, config: RcloneConfig) -> Result<(), AppError> {
        let rc_client = RcClient::new(&config)
            .map_err(|e| AppError::Daemon(format!("Failed to create RC client: {}", e)))?;
        *self.config.write() = config;
        *self.rc_client.write() = rc_client;
        Ok(())
    }

    /// Start the rclone mount daemon using the Tauri sidecar.
    ///
    /// This mirrors `Start-UplinkMount` from the PS script:
    /// 1. Check if RC API is already alive (reattach if so)
    /// 2. Spawn sidecar with piped stdout/stderr via plugin-shell
    /// 3. Wait up to 15s for RC API readiness (polling every 500ms)
    pub async fn start(&self) -> Result<(), AppError> {
        // Check current status
        {
            let state = self.state.read();
            match &state.status {
                DaemonStatus::Running => {
                    return Err(AppError::Daemon("rclone is already running".into()));
                }
                DaemonStatus::Starting => {
                    return Err(AppError::Daemon("rclone is already starting".into()));
                }
                DaemonStatus::Stopping => {
                    return Err(AppError::Daemon(
                        "rclone is currently stopping, please wait".into(),
                    ));
                }
                _ => {}
            }
        }

        let config = self.config();
        let rc_client = self.rc_client();

        // 1. Check if RC API is already running (external rclone instance)
        if rc_client.is_alive().await {
            info!("RC API already responsive — attaching to existing rclone instance");
            let mut state = self.state.write();
            state.status = DaemonStatus::Running;
            state.started_at = Some(Utc::now());
            state.started_by_app = false;
            state.active_profile_id = Some(config.profile_id.clone());
            return Ok(());
        }

        // 2. Transition to Starting
        {
            let mut state = self.state.write();
            state.status = DaemonStatus::Starting;
            state.active_profile_id = Some(config.profile_id.clone());
        }

        info!(
            remote = %config.remote,
            mount_point = %config.mount_point,
            "Spawning rclone sidecar mount process"
        );

        // Build CLI arguments (binary path is resolved by sidecar system)
        let args = config.to_args();

        // 3. Spawn the sidecar via Tauri's plugin-shell
        let sidecar_cmd = self
            .app_handle
            .shell()
            .sidecar("rclone")
            .map_err(|e| {
                let msg = format!("Failed to create sidecar command: {}", e);
                let mut state = self.state.write();
                state.status = DaemonStatus::Crashed { message: msg.clone() };
                AppError::Daemon(msg)
            })?
            .args(&args);

        let (rx, child) = sidecar_cmd
            .spawn()
            .map_err(|e| {
                let msg = format!("Failed to spawn rclone sidecar: {}", e);
                let mut state = self.state.write();
                state.status = DaemonStatus::Crashed { message: msg.clone() };
                AppError::Daemon(msg)
            })?;

        let pid = child.pid();
        info!(pid = pid, "rclone sidecar spawned");

        // 4. Capture stdout/stderr from the CommandEvent stream
        self.spawn_event_reader(rx);

        // Store child handle for later shutdown
        {
            let mut handle = self.child_handle.lock().await;
            *handle = Some(child);
        }

        // 5. Wait for RC API readiness (15 second deadline, 500ms polling)
        let ready = self.wait_for_rc_ready(15, 500).await;

        if !ready {
            // Kill the unresponsive sidecar process
            let msg = format!(
                "rclone started but the RC API did not respond at {} within 15 seconds",
                config.rc_url()
            );
            warn!("{}", msg);
            {
                let mut state = self.state.write();
                state.status = DaemonStatus::Crashed { message: msg.clone() };
            }
            // Kill the sidecar
            {
                let mut handle = self.child_handle.lock().await;
                if let Some(child) = handle.take() {
                    let _ = child.kill();
                }
            }
            return Err(AppError::Daemon(msg));
        }

        // Success — rclone is running and RC API is responsive
        {
            let mut state = self.state.write();
            state.status = DaemonStatus::Running;
            state.pid = Some(pid);
            state.started_at = Some(Utc::now());
            state.started_by_app = true;
        }

        info!(pid = pid, "rclone mount is live and RC API is responsive");
        Ok(())
    }

    /// Stop the rclone mount daemon.
    ///
    /// Mirrors `Stop-UplinkMount` from the PS script:
    /// 1. Send unmount command via RC API
    /// 2. Wait 1 second for graceful shutdown
    /// 3. Force-kill if still running
    pub async fn stop(&self) -> Result<(), AppError> {
        {
            let state = self.state.read();
            if state.status == DaemonStatus::Idle {
                return Ok(());
            }
            if !state.started_by_app {
                // If we didn't start it, just clear our state
                drop(state);
                let mut state = self.state.write();
                *state = DaemonState::default();
                return Ok(());
            }
        }

        // Transition to Stopping
        {
            let mut state = self.state.write();
            state.status = DaemonStatus::Stopping;
        }

        info!("Initiating graceful rclone shutdown");

        let config = self.config();
        let rc_client = self.rc_client();

        // 1. Send unmount command via RC API
        match rc_client.mount_unmount(&config.mount_point).await {
            Ok(_) => info!("Unmount command accepted"),
            Err(e) => warn!(error = %e, "Unmount command failed (process may already be dead)"),
        }

        // 2. Wait 1 second for graceful shutdown
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;

        // 3. Force-kill sidecar if still running
        {
            let mut handle = self.child_handle.lock().await;
            if let Some(child) = handle.take() {
                info!("Force-killing rclone sidecar process");
                let _ = child.kill();
            }
        }

        // Reset state
        {
            let mut state = self.state.write();
            *state = DaemonState::default();
        }

        info!("rclone shutdown complete");

        // Delete temporary config file if present
        let config = self.config();
        if let Some(ref path) = config.config_path {
            let path_buf = std::path::PathBuf::from(path);
            if path_buf.exists() {
                if let Err(e) = std::fs::remove_file(&path_buf) {
                    warn!(error = %e, path = %path, "Failed to delete temporary config file");
                } else {
                    info!(path = %path, "Temporary config file deleted");
                }
            }
        }

        Ok(())
    }

    /// Restart the rclone daemon (stop → start).
    pub async fn restart(&self) -> Result<(), AppError> {
        self.stop().await?;
        // Brief pause between stop and start
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        self.start().await
    }

    /// Poll RC API until it responds or the deadline expires.
    async fn wait_for_rc_ready(&self, timeout_secs: u64, poll_ms: u64) -> bool {
        let rc_client = self.rc_client();
        let deadline = tokio::time::Instant::now()
            + std::time::Duration::from_secs(timeout_secs);

        while tokio::time::Instant::now() < deadline {
            if rc_client.is_alive().await {
                return true;
            }
            tokio::time::sleep(std::time::Duration::from_millis(poll_ms)).await;
        }

        false
    }

    /// Spawn a background task that reads CommandEvents from the sidecar
    /// and feeds stdout/stderr lines into the LogManager.
    ///
    /// Uses Tauri's `CommandEvent` stream instead of raw pipe handles.
    fn spawn_event_reader(
        &self,
        mut rx: tauri::async_runtime::Receiver<CommandEvent>,
    ) {
        let log_manager = Arc::clone(&self.log_manager);
        let state = Arc::clone(&self.state);
        let profile_id = self.config().profile_id.clone();

        tokio::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes).to_string();
                        log_manager.ingest(LogStream::Stdout, line, Some(profile_id.clone()));
                    }
                    CommandEvent::Stderr(line_bytes) => {
                        let line = String::from_utf8_lossy(&line_bytes).to_string();
                        log_manager.ingest(LogStream::Stderr, line, Some(profile_id.clone()));
                    }
                    CommandEvent::Terminated(payload) => {
                        let exit_code = payload.code.unwrap_or(-1);
                        let signal = payload.signal;
                        info!(
                            code = ?payload.code,
                            signal = ?payload.signal,
                            "rclone sidecar process terminated"
                        );

                        // Update daemon state to Crashed if termination was unexpected
                        {
                            let mut s = state.write();
                            if s.status == DaemonStatus::Running || s.status == DaemonStatus::Starting {
                                let message = if let Some(sig) = signal {
                                    format!("rclone process killed by signal {}", sig)
                                } else if exit_code != 0 {
                                    format!("rclone process exited with code {}", exit_code)
                                } else {
                                    "rclone process exited unexpectedly".into()
                                };
                                warn!(message = %message, "Daemon crashed");
                                s.status = DaemonStatus::Crashed { message };
                                s.pid = None;
                            }
                        }
                        break;
                    }
                    _ => {}
                }
            }
            info!("rclone event reader task ended");
        });
    }
}

// ─── Free Port Helper ────────────────────────────────────────────────────────

fn get_free_port() -> Option<u16> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|listener| listener.local_addr())
        .map(|addr| addr.port())
        .ok()
}

// ─── Default Config Path Helper ──────────────────────────────────────────────

async fn get_default_config_path(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri_plugin_shell::ShellExt;
    let sidecar_cmd = app
        .shell()
        .sidecar("rclone")
        .ok()?
        .args(&["config", "file"]);

    let output = sidecar_cmd.output().await.ok()?;
    if !output.status.success() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        let line_trimmed = line.trim();
        if (line_trimmed.starts_with("C:\\") || line_trimmed.starts_with("\\\\") || line_trimmed.contains('/') || line_trimmed.contains('\\')) && line_trimmed.ends_with(".conf") {
            return Some(std::path::PathBuf::from(line_trimmed));
        }
    }
    None
}

// ─── Rclone Conf Generation ───────────────────────────────────────────────

async fn generate_rclone_conf(app: &tauri::AppHandle, profile: &super::profiles::MountProfile) -> Result<Option<String>, AppError> {
    if profile.provider == "other" && !profile.use_crypt {
        return Ok(None);
    }

    let mut conf = String::new();
    let remote_name = &profile.id;

    if profile.provider == "other" {
        if let Some(default_path) = get_default_config_path(app).await {
            if let Ok(contents) = std::fs::read_to_string(default_path) {
                conf.push_str(&contents);
                conf.push_str("\n");
            }
        }
    } else {
        conf.push_str(&format!("[{}]\n", remote_name));
        match profile.provider.as_str() {
            "gdrive" | "onedrive" | "dropbox" => {
                let rclone_type = match profile.provider.as_str() {
                    "gdrive" => "drive",
                    "onedrive" => "onedrive",
                    "dropbox" => "dropbox",
                    _ => unreachable!(),
                };
                conf.push_str(&format!("type = {}\n", rclone_type));
                if let Some(token) = profile.credentials.get("token") {
                    conf.push_str(&format!("token = {}\n", token));
                }
                if let Some(cid) = profile.credentials.get("clientId") {
                    if !cid.trim().is_empty() {
                        conf.push_str(&format!("client_id = {}\n", cid));
                    }
                }
                if let Some(csec) = profile.credentials.get("clientSecret") {
                    if !csec.trim().is_empty() {
                        conf.push_str(&format!("client_secret = {}\n", csec));
                    }
                }
            }
            "s3" => {
                conf.push_str("type = s3\n");
                conf.push_str("provider = AWS\n");
                if let Some(key_id) = profile.credentials.get("accessKeyId") {
                    conf.push_str(&format!("access_key_id = {}\n", key_id));
                }
                if let Some(secret) = profile.credentials.get("secretAccessKey") {
                    conf.push_str(&format!("secret_access_key = {}\n", secret));
                }
                if let Some(region) = profile.credentials.get("region") {
                    conf.push_str(&format!("region = {}\n", region));
                }
            }
            "protondrive" => {
                conf.push_str("type = protondrive\n");
                if let Some(username) = profile.credentials.get("username") {
                    conf.push_str(&format!("username = {}\n", username));
                }
                if let Some(password) = profile.credentials.get("password") {
                    conf.push_str(&format!("password = {}\n", password));
                }
            }
            _ => {}
        }
    }

    if profile.use_crypt {
        let crypt_name = format!("{}-crypt", remote_name);
        conf.push_str("\n");
        conf.push_str(&format!("[{}]\n", crypt_name));
        conf.push_str("type = crypt\n");

        let path = if let Some(pos) = profile.remote.find(':') {
            &profile.remote[pos+1..]
        } else {
            ""
        };

        let base_remote = if profile.provider == "other" {
            if let Some(pos) = profile.remote.find(':') {
                &profile.remote[..pos]
            } else {
                &profile.remote
            }
        } else {
            remote_name
        };

        conf.push_str(&format!("remote = {}:{}\n", base_remote, path));
        conf.push_str("filename_encryption = standard\n");
        conf.push_str("directory_name_encryption = true\n");
        if let Some(crypt_pass) = profile.credentials.get("cryptPassword") {
            conf.push_str(&format!("password = {}\n", crypt_pass));
        }
    }

    Ok(Some(conf))
}

// ─── Mount Manager ──────────────────────────────────────────────────────────

pub struct MountManager {
    app_handle: AppHandle,
    daemons: parking_lot::RwLock<std::collections::HashMap<String, Arc<DaemonManager>>>,
    log_manager: Arc<LogManager>,
}

impl MountManager {
    pub fn new(app_handle: AppHandle, log_manager: Arc<LogManager>) -> Self {
        Self {
            app_handle,
            daemons: parking_lot::RwLock::new(std::collections::HashMap::new()),
            log_manager,
        }
    }

    pub fn get_or_create_daemon(&self, profile: &super::profiles::MountProfile) -> Result<Arc<DaemonManager>, AppError> {
        let mut daemons = self.daemons.write();
        if let Some(daemon) = daemons.get(&profile.id) {
            return Ok(Arc::clone(daemon));
        }

        let config = profile.to_rclone_config();
        let rc_client = RcClient::new(&config)
            .map_err(|e| AppError::Daemon(format!("Failed to create RC client: {}", e)))?;

        let daemon = Arc::new(DaemonManager::new(
            self.app_handle.clone(),
            config,
            rc_client,
            Arc::clone(&self.log_manager),
        ));

        daemons.insert(profile.id.clone(), Arc::clone(&daemon));
        Ok(daemon)
    }

    pub fn get_daemon(&self, profile_id: &str) -> Result<Arc<DaemonManager>, AppError> {
        let daemons = self.daemons.read();
        daemons
            .get(profile_id)
            .cloned()
            .ok_or_else(|| AppError::Daemon(format!("No active mount for profile ID {}", profile_id)))
    }

    pub fn remove_daemon(&self, profile_id: &str) {
        let mut daemons = self.daemons.write();
        daemons.remove(profile_id);
    }

    pub fn list_active_profiles(&self) -> Vec<String> {
        let daemons = self.daemons.read();
        daemons
            .iter()
            .filter(|(_, d)| d.state().status == DaemonStatus::Running)
            .map(|(id, _)| id.clone())
            .collect()
    }

    pub async fn stop_all(&self) -> Result<(), AppError> {
        let daemons: Vec<Arc<DaemonManager>> = {
            let d = self.daemons.read();
            d.values().cloned().collect()
        };
        for daemon in daemons {
            let _ = daemon.stop().await;
        }
        Ok(())
    }

    pub async fn start_mount(&self, app: &tauri::AppHandle, profile: &super::profiles::MountProfile) -> Result<DaemonState, AppError> {
        let daemon = self.get_or_create_daemon(profile)?;
        
        let mut config = profile.to_rclone_config();
        
        // Map correct remote identifier to config
        if profile.use_crypt {
            config.remote = format!("{}-crypt:", profile.id);
        } else if profile.provider != "other" {
            let path = if let Some(pos) = profile.remote.find(':') {
                &profile.remote[pos+1..]
            } else {
                ""
            };
            config.remote = format!("{}:{}", profile.id, path);
        }

        // Dynamic port and password
        let port = get_free_port().unwrap_or(5572);
        let password = uuid::Uuid::new_v4().to_string().replace("-", "");
        config.rc_addr = format!("127.0.0.1:{}", port);
        config.rc_pass = password;

        // Set dynamic log file path
        use tauri::Manager;
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::Io(format!("Failed to get app data directory: {}", e)))?;
        let log_dir = app_data_dir.join("logs");
        std::fs::create_dir_all(&log_dir)
            .map_err(|e| AppError::Io(format!("Failed to create logs directory: {}", e)))?;
        let log_file = log_dir.join(format!("profile_{}.log", profile.id));
        config.log_file = Some(log_file.to_string_lossy().to_string());

        // Generate temp config file
        if let Some(conf_content) = generate_rclone_conf(app, profile).await? {
            use tauri::Manager;
            let cache_dir = app
                .path()
                .app_cache_dir()
                .map_err(|e| AppError::Io(format!("Failed to get cache directory: {}", e)))?;
            
            std::fs::create_dir_all(&cache_dir)
                .map_err(|e| AppError::Io(format!("Failed to create cache directory: {}", e)))?;

            let conf_path = cache_dir.join(format!("stratafuse-{}.conf", profile.id));
            std::fs::write(&conf_path, conf_content)
                .map_err(|e| AppError::Io(format!("Failed to write temporary config: {}", e)))?;

            config.config_path = Some(conf_path.to_string_lossy().to_string());
        }

        daemon.set_config(config)?;
        daemon.start().await?;
        Ok(daemon.state())
    }
}

