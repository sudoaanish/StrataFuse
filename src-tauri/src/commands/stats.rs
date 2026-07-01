use std::sync::Arc;
use serde::Serialize;
use serde_json::Value;
use tauri::State;

use crate::error::AppError;
use crate::rclone::daemon::{MountManager, MountStatus};

// ─── Response Types ─────────────────────────────────────────────────────────

/// Aggregated stats response combining core/stats and vfs/stats.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AggregatedStats {
    pub mount_status: MountStatus,
    pub core_stats: Option<Value>,
    pub vfs_stats: Option<Value>,
    pub recent_transfers: Option<Value>,
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Get transfer statistics from `core/stats`.
///
/// Frontend: `await invoke("get_core_stats", { profileId: "uuid" })`
/// Polled every 2 seconds by the dashboard.
#[tauri::command]
pub async fn get_core_stats(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<Value, AppError> {
    let daemon = mount_manager.get_daemon(&profile_id)?;
    daemon.rc_client().core_stats().await
}

/// Get VFS cache statistics from `vfs/stats`.
///
/// Frontend: `await invoke("get_vfs_stats", { profileId: "uuid" })`
/// Polled every 2 seconds alongside core_stats.
#[tauri::command]
pub async fn get_vfs_stats(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<Value, AppError> {
    let daemon = mount_manager.get_daemon(&profile_id)?;
    daemon.rc_client().vfs_stats().await
}

/// Get current mount status by querying `mount/listmounts`.
///
/// Frontend: `await invoke("get_mount_status", { profileId: "uuid" })`
#[tauri::command]
pub async fn get_mount_status(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<MountStatus, AppError> {
    let daemon = match mount_manager.get_daemon(&profile_id) {
        Ok(d) => d,
        Err(_) => return Ok(MountStatus::RcOffline),
    };

    let rc = daemon.rc_client();
    let config = daemon.config();
    match rc.mount_listmounts().await {
        Ok(response) => {
            let is_mounted = response
                .get("mountPoints")
                .and_then(|v| v.as_array())
                .map(|mounts| {
                    mounts.iter().any(|m| {
                        m.get("MountPoint")
                            .and_then(|v| v.as_str())
                            .map(|mp| mp == config.mount_point)
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if is_mounted {
                Ok(MountStatus::Mounted)
            } else {
                Ok(MountStatus::RcOnlineMountNotListed)
            }
        }
        Err(_) => Ok(MountStatus::RcOffline),
    }
}

/// Get completed/recent transfer history from `core/transferred`.
///
/// Frontend: `await invoke("get_recent_transfers", { profileId: "uuid" })`
#[tauri::command]
pub async fn get_recent_transfers(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<Value, AppError> {
    let daemon = mount_manager.get_daemon(&profile_id)?;
    daemon.rc_client().core_transferred().await
}

/// Get aggregated stats in a single call (reduces polling overhead).
///
/// Frontend: `await invoke("get_aggregated_stats", { profileId: "uuid" })`
/// Combines mount status, core/stats, and vfs/stats into one response.
#[tauri::command]
pub async fn get_aggregated_stats(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<AggregatedStats, AppError> {
    let daemon = match mount_manager.get_daemon(&profile_id) {
        Ok(d) => d,
        Err(_) => {
            return Ok(AggregatedStats {
                mount_status: MountStatus::RcOffline,
                core_stats: None,
                vfs_stats: None,
                recent_transfers: None,
            });
        }
    };

    let rc = daemon.rc_client();
    let config = daemon.config();

    // Determine mount status
    let mount_status = match rc.mount_listmounts().await {
        Ok(response) => {
            let is_mounted = response
                .get("mountPoints")
                .and_then(|v| v.as_array())
                .map(|mounts| {
                    mounts.iter().any(|m| {
                        m.get("MountPoint")
                            .and_then(|v| v.as_str())
                            .map(|mp| mp == config.mount_point)
                            .unwrap_or(false)
                    })
                })
                .unwrap_or(false);

            if is_mounted {
                MountStatus::Mounted
            } else {
                MountStatus::RcOnlineMountNotListed
            }
        }
        Err(_) => MountStatus::RcOffline,
    };

    // Fetch core stats (non-fatal if unavailable)
    let core_stats = rc.core_stats().await.ok();

    // Fetch VFS stats (non-fatal if unavailable)
    let vfs_stats = rc.vfs_stats().await.ok();

    // Fetch recent transfers (non-fatal if unavailable)
    let recent_transfers = rc.core_transferred().await.ok();

    Ok(AggregatedStats {
        mount_status,
        core_stats,
        vfs_stats,
        recent_transfers,
    })
}

