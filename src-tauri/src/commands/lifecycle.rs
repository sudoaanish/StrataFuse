use std::sync::Arc;
use tauri::State;

use crate::error::AppError;
use crate::rclone::daemon::{MountManager, DaemonState};
use crate::rclone::profiles::ProfileManager;

/// Start the rclone mount daemon for a specific profile.
///
/// Frontend: `await invoke("start_mount", { profileId: "uuid" })`
#[tauri::command]
pub async fn start_mount(
    app: tauri::AppHandle,
    mount_manager: State<'_, Arc<MountManager>>,
    profile_manager: State<'_, Arc<ProfileManager>>,
    profile_id: String,
) -> Result<DaemonState, AppError> {
    let profile = profile_manager
        .get(&profile_id)
        .ok_or_else(|| AppError::InvalidInput(format!("Profile not found: {}", profile_id)))?;

    // Mark profile as recently used
    profile_manager.touch(&profile_id);

    // Call start mount inside MountManager registry
    let res = mount_manager.start_mount(&app, &profile).await;
    
    // Update system tray menu status
    crate::update_tray_menu(&app);

    res
}

/// Stop the rclone mount daemon.
///
/// Frontend: `await invoke("stop_mount", { profileId: "uuid" })`
#[tauri::command]
pub async fn stop_mount(
    app: tauri::AppHandle,
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<DaemonState, AppError> {
    let daemon = mount_manager.get_daemon(&profile_id)?;
    daemon.stop().await?;
    let state = daemon.state();
    mount_manager.remove_daemon(&profile_id);

    // Update system tray menu status
    crate::update_tray_menu(&app);

    Ok(state)
}

/// Restart the rclone mount daemon (stop → start).
///
/// Frontend: `await invoke("restart_mount", { profileId: "uuid" })`
#[tauri::command]
pub async fn restart_mount(
    app: tauri::AppHandle,
    mount_manager: State<'_, Arc<MountManager>>,
    profile_manager: State<'_, Arc<ProfileManager>>,
    profile_id: String,
) -> Result<DaemonState, AppError> {
    let _ = stop_mount(app.clone(), mount_manager.clone(), profile_id.clone()).await;
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    start_mount(app, mount_manager, profile_manager, profile_id).await
}

/// Get the current daemon state without modifying anything.
///
/// Frontend: `await invoke("get_daemon_status", { profileId: "uuid" })`
#[tauri::command]
pub async fn get_daemon_status(
    mount_manager: State<'_, Arc<MountManager>>,
    profile_id: String,
) -> Result<DaemonState, AppError> {
    if let Ok(daemon) = mount_manager.get_daemon(&profile_id) {
        Ok(daemon.state())
    } else {
        // Return default idle state if no mount session exists yet for this profile
        Ok(DaemonState::default())
    }
}

/// Get a list of all profile IDs that are currently active (running).
///
/// Frontend: `await invoke("get_active_mounts")`
#[tauri::command]
pub async fn get_active_mounts(
    mount_manager: State<'_, Arc<MountManager>>,
) -> Result<Vec<String>, AppError> {
    Ok(mount_manager.list_active_profiles())
}

/// Open the mount point folder in Windows Explorer.
///
/// Frontend: `await invoke("open_in_explorer", { mountPoint: "S:" })`
#[tauri::command]
pub async fn open_in_explorer(mount_point: String) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let path = if mount_point.ends_with('\\') {
            mount_point
        } else {
            format!("{}\\", mount_point)
        };
        let _ = std::process::Command::new("explorer.exe")
            .arg(&path)
            .spawn()
            .map_err(|e| AppError::Io(format!("Failed to open explorer: {}", e)))?;
    }
    Ok(())
}

/// Set the app to run on Windows startup (minimized to tray).
///
/// Frontend: `await invoke("set_autostart", { enabled: true })`
#[tauri::command]
pub async fn set_autostart(enabled: bool) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    {
        let exe_path = std::env::current_exe()
            .map_err(|e| AppError::Io(format!("Failed to get current executable path: {}", e)))?;
        let exe_str = exe_path.to_string_lossy();

        if enabled {
            let status = std::process::Command::new("reg")
                .args(&[
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "StrataFuse",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{}\" --minimized", exe_str),
                    "/f",
                ])
                .status()
                .map_err(|e| AppError::Io(format!("Failed to execute reg command: {}", e)))?;
            if !status.success() {
                return Err(AppError::Io("Registry autostart key creation failed".into()));
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args(&[
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "StrataFuse",
                    "/f",
                ])
                .status();
        }
    }
    Ok(())
}

/// Get the current autostart registry state.
///
/// Frontend: `await invoke("get_autostart")`
#[tauri::command]
pub async fn get_autostart() -> Result<bool, AppError> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("reg")
            .args(&[
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "StrataFuse",
            ])
            .output()
            .map_err(|e| AppError::Io(format!("Failed to query registry: {}", e)))?;
        
        Ok(output.status.success())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

