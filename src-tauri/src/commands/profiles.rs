use std::sync::Arc;
use tauri::State;

use crate::error::AppError;
use crate::rclone::profiles::{MountProfile, ProfileManager};

/// List all saved mount profiles.
///
/// Frontend: `await invoke("list_profiles")`
#[tauri::command]
pub async fn list_profiles(
    profile_manager: State<'_, Arc<ProfileManager>>,
) -> Result<Vec<MountProfile>, AppError> {
    Ok(profile_manager.list())
}

/// Get a single profile by ID.
///
/// Frontend: `await invoke("get_profile", { id: "uuid" })`
#[tauri::command]
pub async fn get_profile(
    profile_manager: State<'_, Arc<ProfileManager>>,
    id: String,
) -> Result<MountProfile, AppError> {
    profile_manager
        .get(&id)
        .ok_or_else(|| AppError::InvalidInput(format!("Profile not found: {}", id)))
}

/// Create a new mount profile from wizard data.
///
/// Frontend: `await invoke("create_profile", { profile: { ... } })`
#[tauri::command]
pub async fn create_profile(
    app: tauri::AppHandle,
    profile_manager: State<'_, Arc<ProfileManager>>,
    profile: MountProfile,
) -> Result<MountProfile, AppError> {
    let new_profile = profile_manager
        .create(profile)
        .map_err(|e| AppError::Io(e.to_string()))?;
        
    crate::update_tray_menu(&app);
    Ok(new_profile)
}

/// Delete a mount profile by ID.
///
/// Frontend: `await invoke("delete_profile", { id: "uuid" })`
#[tauri::command]
pub async fn delete_profile(
    app: tauri::AppHandle,
    profile_manager: State<'_, Arc<ProfileManager>>,
    id: String,
) -> Result<(), AppError> {
    profile_manager
        .delete(&id)
        .map_err(|e| AppError::Io(e.to_string()))?;
        
    crate::update_tray_menu(&app);
    Ok(())
}

/// Update an existing mount profile.
///
/// Frontend: `await invoke("update_profile", { id: "uuid", profile: { ... } })`
#[tauri::command]
pub async fn update_profile(
    app: tauri::AppHandle,
    profile_manager: State<'_, Arc<ProfileManager>>,
    id: String,
    profile: MountProfile,
) -> Result<(), AppError> {
    profile_manager
        .update(&id, profile)
        .map_err(|e| AppError::Io(e.to_string()))?;
        
    crate::update_tray_menu(&app);
    Ok(())
}

/// Obscure a cleartext password using rclone's built-in obscuring algorithm.
///
/// Frontend: `await invoke("obscure_password", { password: "plain" })`
#[tauri::command]
pub async fn obscure_password(
    app: tauri::AppHandle,
    password: String,
) -> Result<String, AppError> {
    use tauri_plugin_shell::ShellExt;
    
    let sidecar_cmd = app
        .shell()
        .sidecar("rclone")
        .map_err(|e| AppError::Daemon(format!("Failed to create sidecar command: {}", e)))?
        .args(&["obscure", &password]);

    let output = sidecar_cmd
        .output()
        .await
        .map_err(|e| AppError::Daemon(format!("Failed to run sidecar: {}", e)))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(AppError::Daemon(format!("rclone obscure failed: {}", stderr)));
    }

    let obscured = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok(obscured)
}

/// Authorize a cloud provider using rclone authorize.
///
/// Frontend: `await invoke("authorize_provider", { provider: "gdrive" })`
#[tauri::command]
pub async fn authorize_provider(
    app: tauri::AppHandle,
    active_auth: tauri::State<'_, crate::ActiveAuth>,
    provider: String,
    client_id: Option<String>,
    client_secret: Option<String>,
) -> Result<String, AppError> {
    use tauri_plugin_shell::ShellExt;

    // Map provider name to rclone's provider identifier if needed
    let provider_id = match provider.as_str() {
        "gdrive" => "drive",
        "onedrive" => "onedrive",
        "dropbox" => "dropbox",
        other => other,
    };

    let mut args = vec!["authorize".to_string(), provider_id.to_string()];
    let arg_client_id;
    let arg_client_secret;
    
    if let Some(ref cid) = client_id {
        if !cid.trim().is_empty() {
            arg_client_id = format!("--{}-client-id", provider_id);
            args.push(arg_client_id);
            args.push(cid.clone());
        }
    }
    if let Some(ref csec) = client_secret {
        if !csec.trim().is_empty() {
            arg_client_secret = format!("--{}-client-secret", provider_id);
            args.push(arg_client_secret);
            args.push(csec.clone());
        }
    }

    // Force-terminate any previous authorize process from this session
    let mut killed = false;
    {
        let mut lock = active_auth.child.lock();
        if let Some(old_child) = lock.take() {
            let _ = old_child.kill();
            killed = true;
        }
    }

    // Check if port 53682 is in use (might be an orphaned process from a previous run)
    let port_in_use = std::net::TcpListener::bind("127.0.0.1:53682").is_err();
    if port_in_use {
        #[cfg(target_os = "windows")]
        {
            let _ = std::process::Command::new("cmd")
                .args(&["/C", "for /f \"tokens=5\" %a in ('netstat -aon ^| findstr 53682') do taskkill /F /PID %a"])
                .output();
            killed = true;
        }
    }

    if killed {
        // Sleep 800ms to allow the OS to clean up socket handles and release the port
        tokio::time::sleep(std::time::Duration::from_millis(800)).await;
    }

    let sidecar_cmd = app
        .shell()
        .sidecar("rclone")
        .map_err(|e| AppError::Daemon(format!("Failed to create sidecar command: {}", e)))?
        .args(&args);

    let (mut rx, child) = sidecar_cmd
        .spawn()
        .map_err(|e| AppError::Daemon(format!("Failed to spawn sidecar: {}", e)))?;

    // Store the active child handle in managed state
    {
        let mut lock = active_auth.child.lock();
        *lock = Some(child);
    }

    let child_future = async {
        let mut stdout_bytes = Vec::new();
        let mut stderr_bytes = Vec::new();
        let mut exit_code = None;

        while let Some(event) = rx.recv().await {
            match event {
                tauri_plugin_shell::process::CommandEvent::Stdout(line) => {
                    stdout_bytes.extend_from_slice(&line);
                }
                tauri_plugin_shell::process::CommandEvent::Stderr(line) => {
                    stderr_bytes.extend_from_slice(&line);
                }
                tauri_plugin_shell::process::CommandEvent::Terminated(payload) => {
                    exit_code = payload.code;
                    break;
                }
                _ => {}
            }
        }
        Ok::<_, AppError>((stdout_bytes, stderr_bytes, exit_code))
    };

    // 3 minute timeout
    let result = match tokio::time::timeout(std::time::Duration::from_secs(180), child_future).await {
        Ok(res) => res,
        Err(_) => {
            let mut lock = active_auth.child.lock();
            if let Some(c) = lock.take() {
                let _ = c.kill();
            }
            return Err(AppError::Daemon("Authorization timed out after 3 minutes".into()));
        }
    };

    // Clear active child handle
    {
        let mut lock = active_auth.child.lock();
        *lock = None;
    }

    let (stdout, stderr, exit_code) = result?;

    if exit_code != Some(0) {
        let stderr_str = String::from_utf8_lossy(&stderr).to_string();
        return Err(AppError::Daemon(format!("rclone authorize failed: {}", stderr_str)));
    }

    let stdout_str = String::from_utf8_lossy(&stdout).to_string();
    if let (Some(start), Some(end)) = (stdout_str.find('{'), stdout_str.rfind('}')) {
        let token_json = &stdout_str[start..=end];
        Ok(token_json.trim().to_string())
    } else {
        Err(AppError::Daemon(format!("Failed to find JSON token in rclone output: {}", stdout_str)))
    }
}

/// Purge the VFS cache for a profile.
///
/// Frontend: `await invoke("purge_profile_cache", { profileId: "uuid" })`
#[tauri::command]
pub async fn purge_profile_cache(
    profile_manager: State<'_, Arc<ProfileManager>>,
    profile_id: String,
) -> Result<(), AppError> {
    profile_manager
        .purge_vfs_cache(&profile_id)
        .map_err(|e| AppError::Io(e.to_string()))
}

