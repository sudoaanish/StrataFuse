use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tracing::{info, warn};
use uuid::Uuid;

use super::config::RcloneConfig;

// ─── Tuning Presets ─────────────────────────────────────────────────────────

/// Pre-defined VFS tuning profiles matching the wizard's Step 4 options.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TuningProfile {
    /// Media Streaming (Jellyfin/Plex): full cache, 100G, network mode.
    /// Maps the exact flags from Uplink_Status.ps1.
    MediaStreaming,
    /// General Purpose: writes cache, 10G.
    GeneralPurpose,
    /// Backup / Sync: minimal cache, 1G.
    BackupSync,
}

impl std::fmt::Display for TuningProfile {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TuningProfile::MediaStreaming => write!(f, "Media Streaming"),
            TuningProfile::GeneralPurpose => write!(f, "General Purpose"),
            TuningProfile::BackupSync => write!(f, "Backup / Sync"),
        }
    }
}

// ─── Mount Profile ──────────────────────────────────────────────────────────

/// A saved mount configuration representing one cloud account/instance.
///
/// Stored in `profiles.json` inside the Tauri app data directory.
/// Replaces the hardcoded `X:` + `gcrypt:` fields from Step 1.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountProfile {
    /// Unique identifier (UUID v4).
    pub id: String,

    /// User-facing display name, e.g. "My Google Drive".
    pub name: String,

    /// Cloud storage backend: "gdrive", "onedrive", "s3", "dropbox", "proton", "other".
    pub provider: String,

    /// rclone remote specification, e.g. "gdrive:", "gcrypt:", "s3:mybucket".
    pub remote: String,

    /// Local mount point, e.g. "X:" on Windows.
    pub mount_point: String,

    /// Whether a zero-knowledge crypt wrapper is enabled.
    pub use_crypt: bool,

    /// If crypt is enabled, the underlying (unwrapped) remote name.
    pub crypt_remote: Option<String>,

    /// Selected tuning profile preset.
    pub tuning_profile: TuningProfile,

    /// VFS cache mode derived from tuning profile.
    pub vfs_cache_mode: String,

    /// VFS cache max size derived from tuning profile.
    pub vfs_cache_max_size: String,

    /// Present mount as network drive (Windows).
    pub network_mode: bool,

    /// RC API listen address.
    pub rc_addr: String,

    /// RC API basic-auth username.
    pub rc_user: String,

    /// RC API basic-auth password.
    pub rc_pass: String,

    /// When this profile was created.
    pub created_at: DateTime<Utc>,

    /// When this profile was last used to mount.
    pub last_used: Option<DateTime<Utc>>,

    /// Dynamic credentials or tokens associated with the profile.
    #[serde(default)]
    pub credentials: std::collections::HashMap<String, String>,

    /// Whether this profile should mount automatically on app startup.
    #[serde(default)]
    pub auto_mount: bool,
}

impl MountProfile {
    /// Convert this profile into an `RcloneConfig` ready for daemon spawning.
    pub fn to_rclone_config(&self) -> RcloneConfig {
        RcloneConfig {
            profile_id: self.id.clone(),
            remote: self.remote.clone(),
            mount_point: self.mount_point.clone(),
            rc_addr: self.rc_addr.clone(),
            rc_user: self.rc_user.clone(),
            rc_pass: self.rc_pass.clone(),
            vfs_cache_mode: self.vfs_cache_mode.clone(),
            vfs_cache_max_size: self.vfs_cache_max_size.clone(),
            network_mode: self.network_mode,
            rc_enable_metrics: true,
            stats_interval: "5s".into(),
            log_level: "INFO".into(),
            config_path: None,
            volume_name: self.name.clone(),
            log_file: None,
        }
    }
}

// ─── Profile Manager ────────────────────────────────────────────────────────

/// Manages persistent storage of mount profiles.
///
/// Profiles are stored as JSON in `<app_data>/profiles.json`.
pub struct ProfileManager {
    profiles: parking_lot::RwLock<Vec<MountProfile>>,
    profiles_path: PathBuf,
}

impl ProfileManager {
    /// Create a new ProfileManager and load existing profiles from disk.
    pub fn new(app_data_dir: PathBuf) -> Self {
        let profiles_path = app_data_dir.join("profiles.json");
        let profiles = Self::load_from_disk(&profiles_path);

        info!(
            path = %profiles_path.display(),
            count = profiles.len(),
            "Profile manager initialized"
        );

        Self {
            profiles: parking_lot::RwLock::new(profiles),
            profiles_path,
        }
    }

    /// Load profiles from the JSON file, or return empty vec if missing/corrupt.
    fn load_from_disk(path: &PathBuf) -> Vec<MountProfile> {
        match std::fs::read_to_string(path) {
            Ok(contents) => match serde_json::from_str(&contents) {
                Ok(profiles) => profiles,
                Err(e) => {
                    warn!(error = %e, "Failed to parse profiles.json, starting fresh");
                    Vec::new()
                }
            },
            Err(_) => {
                info!("No profiles.json found, starting with empty profiles");
                Vec::new()
            }
        }
    }

    /// Persist all profiles to disk using atomic write (temp file + rename).
    fn save_to_disk(&self) -> Result<(), std::io::Error> {
        let profiles = self.profiles.read();
        let json = serde_json::to_string_pretty(&*profiles)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        // Ensure parent directory exists
        if let Some(parent) = self.profiles_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        // Atomic write: write to temp file, then rename
        let temp_path = self.profiles_path.with_extension("json.tmp");
        std::fs::write(&temp_path, &json)?;
        std::fs::rename(&temp_path, &self.profiles_path)?;

        info!(
            path = %self.profiles_path.display(),
            count = profiles.len(),
            "Profiles saved to disk"
        );
        Ok(())
    }

    /// List all profiles.
    pub fn list(&self) -> Vec<MountProfile> {
        self.profiles.read().clone()
    }

    /// Get a single profile by ID.
    pub fn get(&self, id: &str) -> Option<MountProfile> {
        self.profiles.read().iter().find(|p| p.id == id).cloned()
    }

    /// Create a new profile from wizard data and persist.
    pub fn create(&self, mut profile: MountProfile) -> Result<MountProfile, std::io::Error> {
        // Ensure unique ID
        if profile.id.is_empty() {
            profile.id = Uuid::new_v4().to_string();
        }
        profile.created_at = Utc::now();

        info!(
            id = %profile.id,
            name = %profile.name,
            provider = %profile.provider,
            mount_point = %profile.mount_point,
            "Creating new mount profile"
        );

        {
            let mut profiles = self.profiles.write();
            profiles.push(profile.clone());
        }

        self.save_to_disk()?;
        Ok(profile)
    }

    /// Delete a profile by ID and persist.
    pub fn delete(&self, id: &str) -> Result<(), std::io::Error> {
        {
            let mut profiles = self.profiles.write();
            profiles.retain(|p| p.id != id);
        }

        info!(id = %id, "Profile deleted");
        self.save_to_disk()
    }

    /// Update the last_used timestamp for a profile.
    pub fn touch(&self, id: &str) {
        let mut profiles = self.profiles.write();
        if let Some(profile) = profiles.iter_mut().find(|p| p.id == id) {
            profile.last_used = Some(Utc::now());
        }
        drop(profiles);
        let _ = self.save_to_disk();
    }

    /// Update an existing profile and persist.
    pub fn update(&self, id: &str, updated: MountProfile) -> Result<(), std::io::Error> {
        {
            let mut profiles = self.profiles.write();
            if let Some(profile) = profiles.iter_mut().find(|p| p.id == id) {
                // Preserve the original id and created_at
                let original_id = profile.id.clone();
                let original_created = profile.created_at;
                *profile = updated;
                profile.id = original_id;
                profile.created_at = original_created;
            } else {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    format!("Profile not found: {}", id),
                ));
            }
        }

        info!(id = %id, "Profile updated");
        self.save_to_disk()
    }
}
