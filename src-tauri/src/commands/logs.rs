use std::sync::Arc;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::error::AppError;
use crate::logging::rotation::{LogEntry, LogManager, LogRetentionPolicy};

// ─── Response Types ─────────────────────────────────────────────────────────

/// Response for the log query command.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogQueryResponse {
    /// The requested log entries (most recent last).
    pub entries: Vec<LogEntry>,
    /// Total lines ingested since app start.
    pub total_lines: u64,
    /// Current number of entries in the ring buffer.
    pub buffered_count: usize,
}

/// Payload for updating the log retention policy.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SetPolicyRequest {
    pub policy: LogRetentionPolicy,
}

// ─── Commands ───────────────────────────────────────────────────────────────

/// Get the most recent log entries from the in-memory ring buffer.
///
/// Frontend: `await invoke("get_recent_logs", { count: 200, profileId: "uuid" })`
///
/// Returns instantly from memory — no file I/O. The ring buffer holds
/// up to 5000 entries, allowing the UI to render a live log viewer.
#[tauri::command]
pub async fn get_recent_logs(
    log_manager: State<'_, Arc<LogManager>>,
    count: Option<usize>,
    profile_id: Option<String>,
) -> Result<LogQueryResponse, AppError> {
    let count = count.unwrap_or(200).min(5000);
    let entries = log_manager.recent(count, profile_id.clone());
    
    let total_lines = if let Some(ref id) = profile_id {
        if !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
            return Err(AppError::Io("Invalid profile ID: must be alphanumeric and hyphens only".into()));
        }
        let log_path = log_manager.log_dir.join(format!("profile_{}.log", id));
        if log_path.exists() {
            if let Ok(file) = std::fs::File::open(&log_path) {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(file);
                reader.lines().count() as u64
            } else {
                0
            }
        } else {
            0
        }
    } else {
        log_manager.total_lines()
    };

    let buffered_count = entries.len();

    Ok(LogQueryResponse {
        entries,
        total_lines,
        buffered_count,
    })
}

/// Get the current log retention policy.
///
/// Frontend: `await invoke("get_log_retention_policy")`
#[tauri::command]
pub async fn get_log_retention_policy(
    log_manager: State<'_, Arc<LogManager>>,
) -> Result<LogRetentionPolicy, AppError> {
    Ok(log_manager.get_policy())
}

/// Update the log retention policy at runtime.
///
/// Frontend:
/// ```ts
/// await invoke("set_log_retention_policy", {
///   policy: { type: "maxSizeBytes", limit: 26214400 }
/// })
/// ```
#[tauri::command]
pub async fn set_log_retention_policy(
    log_manager: State<'_, Arc<LogManager>>,
    policy: LogRetentionPolicy,
) -> Result<LogRetentionPolicy, AppError> {
    log_manager.set_policy(policy.clone());
    Ok(policy)
}

/// Clear the in-memory log buffer (does not affect files on disk).
///
/// Frontend: `await invoke("clear_log_buffer")`
#[tauri::command]
pub async fn clear_log_buffer(
    log_manager: State<'_, Arc<LogManager>>,
) -> Result<(), AppError> {
    log_manager.clear_ring();
    Ok(())
}
