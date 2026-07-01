use base64::Engine as _;
use reqwest::Client;
use serde_json::Value;
use std::time::Duration;

use crate::error::AppError;
use super::config::RcloneConfig;

/// Async HTTP client for the rclone Remote Control (RC) JSON API.
///
/// Mirrors the `Invoke-RcloneRc` function from Uplink_Status.ps1, using
/// reqwest instead of PowerShell's `Invoke-RestMethod`.
#[derive(Clone)]
pub struct RcClient {
    client: Client,
    base_url: String,
    auth_header: String,
}

impl RcClient {
    /// Create a new RC client from the application's rclone configuration.
    pub fn new(config: &RcloneConfig) -> Result<Self, AppError> {
        let client = Client::builder()
            .timeout(Duration::from_secs(3)) // Matches PS script's -TimeoutSec 3
            .no_proxy() // RC is always localhost
            .build()
            .map_err(|e| AppError::Http(e.to_string()))?;

        // Pre-compute Basic auth header (mirrors New-RcAuthHeader from PS script)
        let credentials = format!("{}:{}", config.rc_user, config.rc_pass);
        let encoded = base64::engine::general_purpose::STANDARD.encode(credentials.as_bytes());
        let auth_header = format!("Basic {}", encoded);

        Ok(Self {
            client,
            base_url: config.rc_url(),
            auth_header,
        })
    }

    /// Low-level POST request to an RC endpoint.
    ///
    /// All RC API methods are POST with JSON body. This mirrors
    /// `Invoke-RcloneRc` from the PowerShell script.
    async fn post(&self, method: &str, body: Option<Value>) -> Result<Value, AppError> {
        let url = format!("{}/{}", self.base_url, method);
        let payload = body.unwrap_or(Value::Object(serde_json::Map::new()));

        let response = self
            .client
            .post(&url)
            .header("Authorization", &self.auth_header)
            .json(&payload)
            .send()
            .await
            .map_err(|e| AppError::Http(e.to_string()))?;

        if !response.status().is_success() {
            let status = response.status();
            let body_text = response.text().await.unwrap_or_default();
            return Err(AppError::RcApi(format!(
                "RC API {} returned {}: {}",
                method, status, body_text
            )));
        }

        response
            .json::<Value>()
            .await
            .map_err(|e| AppError::Http(e.to_string()))
    }

    // ─── Public API methods (one per RC endpoint used in the PS script) ───

    /// Health check — `POST /rc/noop`.
    /// Mirrors `Test-RcloneRc` from the PS script.
    pub async fn noop(&self) -> Result<(), AppError> {
        self.post("rc/noop", None).await?;
        Ok(())
    }

    /// Test if the RC API is reachable. Returns true/false, never errors.
    pub async fn is_alive(&self) -> bool {
        self.noop().await.is_ok()
    }

    /// Get transfer statistics — `POST /core/stats`.
    /// This is the primary stats endpoint polled every 2s by the dashboard.
    pub async fn core_stats(&self) -> Result<Value, AppError> {
        self.post("core/stats", None).await
    }

    /// Get VFS cache statistics — `POST /vfs/stats`.
    /// Mirrors `Get-VfsStats` from the PS script.
    pub async fn vfs_stats(&self) -> Result<Value, AppError> {
        self.post("vfs/stats", None).await
    }

    /// List active mounts — `POST /mount/listmounts`.
    /// Used by `Get-MountStatus` in the PS script.
    pub async fn mount_listmounts(&self) -> Result<Value, AppError> {
        self.post("mount/listmounts", None).await
    }

    /// Unmount a drive — `POST /mount/unmount`.
    /// Used during graceful shutdown in `Stop-UplinkMount`.
    pub async fn mount_unmount(&self, mount_point: &str) -> Result<Value, AppError> {
        self.post(
            "mount/unmount",
            Some(serde_json::json!({ "mountPoint": mount_point })),
        )
        .await
    }

    /// Get completed transfer history — `POST /core/transferred`.
    /// Used by `Write-CompletedRows` in the PS script.
    pub async fn core_transferred(&self) -> Result<Value, AppError> {
        self.post("core/transferred", None).await
    }
}
