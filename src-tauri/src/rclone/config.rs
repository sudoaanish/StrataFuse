use serde::{Deserialize, Serialize};

/// Complete rclone mount configuration derived from a MountProfile.
///
/// Step 2 evolution: the `rclone_path` field has been removed — the binary
/// is now resolved by Tauri's sidecar system at runtime. This struct holds
/// only the mount-specific parameters needed to build the CLI argument vector.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RcloneConfig {
    /// The profile ID this config was derived from.
    pub profile_id: String,

    /// Remote specification, e.g. "gcrypt:" or "gdrive:"
    pub remote: String,

    /// Local mount point, e.g. "X:" on Windows.
    pub mount_point: String,

    /// RC API listen address (ip:port).
    pub rc_addr: String,

    /// RC API basic-auth username.
    pub rc_user: String,

    /// RC API basic-auth password.
    pub rc_pass: String,

    /// VFS cache mode: off | minimal | writes | full.
    pub vfs_cache_mode: String,

    /// VFS cache maximum size, e.g. "100G".
    pub vfs_cache_max_size: String,

    /// Enable --network-mode (presents mount as network drive on Windows).
    pub network_mode: bool,

    /// Enable --rc-enable-metrics for Prometheus-style metrics.
    pub rc_enable_metrics: bool,

    /// Stats reporting interval, e.g. "5s".
    pub stats_interval: String,

    /// Logging verbosity: DEBUG | INFO | NOTICE | ERROR.
    pub log_level: String,

    /// Path to a temporary rclone config file, if created dynamically.
    pub config_path: Option<String>,

    /// Friendly volume name/label to present to the OS.
    pub volume_name: String,

    /// Path to the log file on disk.
    pub log_file: Option<String>,
}

impl Default for RcloneConfig {
    /// Media streaming defaults matching the original Uplink_Status.ps1 flags.
    /// Used as fallback; profiles.rs generates configs from saved profiles.
    fn default() -> Self {
        Self {
            profile_id: "default".into(),
            remote: "gdrive:".into(),
            mount_point: "X:".into(),
            rc_addr: "127.0.0.1:5572".into(),
            rc_user: "uplink".into(),
            rc_pass: "local-status-only".into(),
            vfs_cache_mode: "full".into(),
            vfs_cache_max_size: "100G".into(),
            network_mode: true,
            rc_enable_metrics: true,
            stats_interval: "5s".into(),
            log_level: "INFO".into(),
            config_path: None,
            volume_name: "StrataFuse Mount".into(),
            log_file: None,
        }
    }
}

impl RcloneConfig {
    /// Build the complete CLI argument vector for `rclone mount`.
    ///
    /// This produces the same argument list as the `$args` array in
    /// `Start-UplinkMount` from Uplink_Status.ps1, **minus** `--log-file`
    /// because StrataFuse captures stdout/stderr directly for managed
    /// log rotation.
    ///
    /// Note: the binary path is NOT included — the sidecar system handles that.
    pub fn to_args(&self) -> Vec<String> {
        let mut args = vec![
            "mount".into(),
            self.remote.clone(),
            self.mount_point.clone(),
            "--vfs-cache-mode".into(),
            self.vfs_cache_mode.clone(),
            "--vfs-cache-max-size".into(),
            self.vfs_cache_max_size.clone(),
            "--rc".into(),
            "--rc-addr".into(),
            self.rc_addr.clone(),
            "--rc-user".into(),
            self.rc_user.clone(),
            "--rc-pass".into(),
            self.rc_pass.clone(),
            "--stats".into(),
            self.stats_interval.clone(),
            "--log-level".into(),
            self.log_level.clone(),
            // Route all logging to stdout/stderr so Rust can capture it.
            "--use-json-log".into(),
            "--dir-cache-time".into(),
            "24h".into(),
            "--vfs-cache-max-age".into(),
            "24h".into(),
        ];

        if self.network_mode {
            args.push("--network-mode".into());
        }

        if self.rc_enable_metrics {
            args.push("--rc-enable-metrics".into());
        }

        if let Some(ref path) = self.config_path {
            args.push("--config".into());
            args.push(path.clone());
        }

        if !self.volume_name.is_empty() {
            args.push("--volname".into());
            args.push(self.volume_name.clone());
        }

        if let Some(ref path) = self.log_file {
            args.push("--log-file".into());
            args.push(path.clone());
        }

        args
    }

    /// Full RC API base URL derived from rc_addr.
    pub fn rc_url(&self) -> String {
        format!("http://{}", self.rc_addr)
    }
}
