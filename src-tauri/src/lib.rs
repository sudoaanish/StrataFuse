mod commands;
mod error;
mod logging;
mod rclone;

use std::sync::Arc;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::WindowEvent;
use tracing::info;
use tracing_subscriber::EnvFilter;

use commands::lifecycle::{get_active_mounts, get_daemon_status, restart_mount, start_mount, stop_mount, open_in_explorer, set_autostart, get_autostart};
use commands::logs::{
    clear_log_buffer, get_log_retention_policy, get_recent_logs, set_log_retention_policy,
};
use commands::profiles::{
    create_profile, delete_profile, get_profile, list_profiles, update_profile,
    obscure_password, authorize_provider, purge_profile_cache,
};
use commands::stats::{
    get_aggregated_stats, get_core_stats, get_mount_status, get_recent_transfers, get_vfs_stats,
};
use logging::rotation::LogManager;
use rclone::daemon::MountManager;
use rclone::profiles::ProfileManager;

pub struct ActiveAuth {
    pub child: parking_lot::Mutex<Option<tauri_plugin_shell::process::CommandChild>>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize structured logging for the StrataFuse app itself
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .with_target(true)
        .with_thread_ids(false)
        .init();

    info!("StrataFuse v{} starting", env!("CARGO_PKG_VERSION"));

    // ─── Build the app ──────────────────────────────────────────────────
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Resolve app data directory
            let app_data_dir = app_handle
                .path()
                .app_data_dir()
                .expect("Failed to resolve app data directory");
            let log_dir = app_data_dir.join("logs");

            // Clean up any stale stratafuse-*.conf temporary files in the cache directory
            if let Ok(cache_dir) = app_handle.path().app_cache_dir() {
                if let Ok(entries) = std::fs::read_dir(cache_dir) {
                    for entry in entries.flatten() {
                        let name = entry.file_name();
                        let name_str = name.to_string_lossy();
                        if name_str.starts_with("stratafuse-") && name_str.ends_with(".conf") {
                            let _ = std::fs::remove_file(entry.path());
                        }
                    }
                }
            }

            info!(log_dir = %log_dir.display(), "Initializing log manager");

            // Initialize the log rotation manager
            let log_manager = Arc::new(LogManager::new(log_dir));

            // Initialize the mount manager (registry of dynamic daemons)
            let mount_manager = Arc::new(MountManager::new(
                app_handle.clone(),
                Arc::clone(&log_manager),
            ));

            // Initialize the profile manager
            let profile_manager = Arc::new(ProfileManager::new(app_data_dir));

            // Register shared state
            app_handle.manage(Arc::clone(&mount_manager));
            app_handle.manage(Arc::clone(&log_manager));
            app_handle.manage(Arc::clone(&profile_manager));
            app_handle.manage(ActiveAuth { child: parking_lot::Mutex::new(None) });

            // Check if minimized command-line argument is passed (for autostart boot)
            let args: Vec<String> = std::env::args().collect();
            if args.contains(&"--minimized".to_string()) {
                if let Some(window) = app_handle.get_webview_window("main") {
                    let _ = window.hide();
                    info!("Started minimized to system tray");
                }
            }

            // ─── Auto-Mount Startup Loop ──────────────────────────────────
            let profile_mgr = Arc::clone(&profile_manager);
            let mount_mgr = Arc::clone(&mount_manager);
            let app_clone = app_handle.clone();
            
            tauri::async_runtime::spawn(async move {
                // Wait briefly for app tray/windows to stabilize
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                
                let profiles = profile_mgr.list();
                for profile in profiles {
                    if profile.auto_mount {
                        info!(profile = %profile.name, "Auto-mounting profile on startup");
                        if let Err(e) = mount_mgr.start_mount(&app_clone, &profile).await {
                            tracing::error!(profile = %profile.name, error = %e, "Failed to auto-mount profile");
                        }
                    }
                }
            });

            // ─── System Tray ────────────────────────────────────────────
            let show_item = MenuItem::with_id(
                app, "show", "Show StrataFuse", true, None::<&str>,
            )?;
            let quit_item = MenuItem::with_id(
                app, "quit", "Quit StrataFuse", true, None::<&str>,
            )?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .tooltip("StrataFuse")
                .on_menu_event(move |app, event| {
                    info!("Tray menu event: id={}", event.id.as_ref());
                    let id = event.id.as_ref().to_string();
                    match id.as_str() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            info!("Quit menu action triggered — stopping mounts");
                            let mount_manager = app.state::<Arc<MountManager>>();
                            let mount_manager = Arc::clone(&mount_manager);
                            tauri::async_runtime::spawn(async move {
                                info!("Stopping all active mounts...");
                                if let Err(e) = mount_manager.stop_all().await {
                                    tracing::error!(error = %e, "Error stopping rclone mounts during quit");
                                }
                                info!("Graceful shutdown complete — exiting process");
                                std::process::exit(0);
                            });
                        }
                        other if other.starts_with("profile:") => {
                            let profile_id = other["profile:".len()..].to_string();
                            let app_handle = app.clone();
                            let profile_mgr = app.state::<Arc<ProfileManager>>();
                            let mount_mgr = app.state::<Arc<MountManager>>();
                            
                            let profile_mgr = Arc::clone(&profile_mgr);
                            let mount_mgr = Arc::clone(&mount_mgr);
                            
                            tauri::async_runtime::spawn(async move {
                                if let Some(profile) = profile_mgr.get(&profile_id) {
                                    let active = mount_mgr.list_active_profiles();
                                    if active.contains(&profile_id) {
                                        // Unmount
                                        if let Ok(daemon) = mount_mgr.get_daemon(&profile_id) {
                                            let _ = daemon.stop().await;
                                            mount_mgr.remove_daemon(&profile_id);
                                        }
                                    } else {
                                        // Mount
                                        let _ = mount_mgr.start_mount(&app_handle, &profile).await;
                                    }
                                    // Trigger menu update after status change
                                    update_tray_menu(&app_handle);
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click toggles window visibility
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Keep the tray icon alive by managing it in state
            app.manage(tray);

            // Populate the initial dynamic tray menu
            update_tray_menu(&app_handle);

            info!("StrataFuse setup complete — system tray active, ready for user interaction");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Lifecycle commands
            start_mount,
            stop_mount,
            restart_mount,
            get_daemon_status,
            get_active_mounts,
            open_in_explorer,
            set_autostart,
            get_autostart,
            // Stats commands
            get_core_stats,
            get_vfs_stats,
            get_mount_status,
            get_recent_transfers,
            get_aggregated_stats,
            // Log commands
            get_recent_logs,
            get_log_retention_policy,
            set_log_retention_policy,
            clear_log_buffer,
            // Profile commands
            list_profiles,
            get_profile,
            create_profile,
            delete_profile,
            update_profile,
            obscure_password,
            authorize_provider,
            purge_profile_cache,
        ])
        // ─── Hide on Close (minimize to tray) ───────────────────────────
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // Prevent the window from actually closing
                api.prevent_close();
                // Hide it to the tray instead
                let _ = window.hide();
                info!("Window hidden to system tray");
            }
        })
        .build(tauri::generate_context!())
        .expect("error building StrataFuse");

    // ─── Prevent app exit when all windows are hidden ────────────────────
    app.run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            // Keep the app running in the tray
            api.prevent_exit();
        }
    });
}

/// Dynamically reconstruct the system tray icon context menu based on active mounts.
pub fn update_tray_menu(app_handle: &tauri::AppHandle) {
    let tray = match app_handle.try_state::<tauri::tray::TrayIcon>() {
        Some(t) => t,
        None => return,
    };
    let profile_manager = match app_handle.try_state::<Arc<ProfileManager>>() {
        Some(p) => p,
        None => return,
    };
    let mount_manager = match app_handle.try_state::<Arc<MountManager>>() {
        Some(m) => m,
        None => return,
    };

    let show_item = MenuItem::with_id(app_handle, "show", "Show StrataFuse", true, None::<&str>).unwrap();
    let quit_item = MenuItem::with_id(app_handle, "quit", "Quit StrataFuse", true, None::<&str>).unwrap();

    let mut menu_items = vec![show_item];
    let mut menu_refs = Vec::new();

    let profiles = profile_manager.list();
    let active_profiles = mount_manager.list_active_profiles();

    if !profiles.is_empty() {
        let sep = tauri::menu::PredefinedMenuItem::separator(app_handle).unwrap();
        menu_items.push(MenuItem::with_id(app_handle, "sep_dyn_placeholder", "", false, None::<&str>).unwrap());
        
        let mut refs = Vec::new();
        refs.push(&menu_items[0] as &dyn tauri::menu::IsMenuItem<tauri::Wry>);
        refs.push(&sep as &dyn tauri::menu::IsMenuItem<tauri::Wry>);

        let mut dyn_items = Vec::new();
        for profile in profiles {
            let is_active = active_profiles.contains(&profile.id);
            let label = if is_active {
                format!("{} ({}) [Active]", profile.name, profile.mount_point)
            } else {
                format!("{} ({})", profile.name, profile.mount_point)
            };
            let id = format!("profile:{}", profile.id);
            let item = MenuItem::with_id(app_handle, id, label, true, None::<&str>).unwrap();
            dyn_items.push(item);
        }

        for item in &dyn_items {
            refs.push(item as &dyn tauri::menu::IsMenuItem<tauri::Wry>);
        }

        let sep2 = tauri::menu::PredefinedMenuItem::separator(app_handle).unwrap();
        refs.push(&sep2 as &dyn tauri::menu::IsMenuItem<tauri::Wry>);
        refs.push(&quit_item as &dyn tauri::menu::IsMenuItem<tauri::Wry>);

        if let Ok(new_menu) = Menu::with_items(app_handle, &refs) {
            let _ = tray.set_menu(Some(new_menu));
        }
    } else {
        let sep2 = tauri::menu::PredefinedMenuItem::separator(app_handle).unwrap();
        menu_refs.push(&menu_items[0] as &dyn tauri::menu::IsMenuItem<tauri::Wry>);
        menu_refs.push(&sep2 as &dyn tauri::menu::IsMenuItem<tauri::Wry>);
        menu_refs.push(&quit_item as &dyn tauri::menu::IsMenuItem<tauri::Wry>);

        if let Ok(new_menu) = Menu::with_items(app_handle, &menu_refs) {
            let _ = tray.set_menu(Some(new_menu));
        }
    }
}
