use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::io::Write;
use std::path::PathBuf;
use tokio::sync::{mpsc, watch};
use tracing::{error, info, warn};

// ─── Public Types ───────────────────────────────────────────────────────────

/// Which stream a log line originated from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

/// A single captured log line with metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub stream: LogStream,
    pub line: String,
    pub profile_id: Option<String>,
}

/// Configurable log retention policy.
///
/// The UI will allow users to toggle between these in a future step.
/// Default is MaxSizeBytes(25MB) to address the user's 100MB+ log problem.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum LogRetentionPolicy {
    /// Delete log files older than 24 hours.
    Hours24,
    /// Keep 7 daily log files, auto-rotate at midnight.
    Days7Rolling,
    /// Truncate the current log file when it exceeds N bytes.
    MaxSizeBytes { limit: u64 },
}

impl Default for LogRetentionPolicy {
    fn default() -> Self {
        // 25 MB — a predictable disk budget, solves the 100MB+ problem
        Self::MaxSizeBytes {
            limit: 25 * 1024 * 1024,
        }
    }
}

impl std::fmt::Display for LogRetentionPolicy {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Hours24 => write!(f, "24 Hours Only"),
            Self::Days7Rolling => write!(f, "7 Days Rolling"),
            Self::MaxSizeBytes { limit } => {
                write!(f, "Max {}MB Auto-Truncate", limit / (1024 * 1024))
            }
        }
    }
}

// ─── Ring Buffer ────────────────────────────────────────────────────────────

/// In-memory ring buffer holding the most recent log entries.
///
/// This serves two purposes:
/// 1. Fast random access for the frontend live log viewer
/// 2. Decoupled from the file-based persistence layer
///
/// Capacity is fixed at construction; oldest entries are evicted when full.
pub struct LogRingBuffer {
    entries: VecDeque<LogEntry>,
    capacity: usize,
}

impl LogRingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            entries: VecDeque::with_capacity(capacity),
            capacity,
        }
    }

    /// Push a new entry, evicting the oldest if at capacity.
    pub fn push(&mut self, entry: LogEntry) {
        if self.entries.len() >= self.capacity {
            self.entries.pop_front();
        }
        self.entries.push_back(entry);
    }

    /// Return the last `count` entries (or all if fewer exist) matching profile_id if specified.
    pub fn recent(&self, count: usize, profile_id: Option<String>) -> Vec<LogEntry> {
        let filtered: Vec<LogEntry> = self.entries.iter().filter(|e| {
            if let Some(ref pid) = profile_id {
                e.profile_id.as_ref() == Some(pid)
            } else {
                true
            }
        }).cloned().collect();

        let start = filtered.len().saturating_sub(count);
        filtered.into_iter().skip(start).collect()
    }

    /// Total entries currently buffered.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Clear all buffered entries.
    pub fn clear(&mut self) {
        self.entries.clear();
    }
}

// ─── File Writer ────────────────────────────────────────────────────────────

/// Manages writing log entries to disk with retention policy enforcement.
struct LogFileWriter {
    log_dir: PathBuf,
    current_file: Option<std::io::BufWriter<std::fs::File>>,
    current_file_path: Option<PathBuf>,
    current_file_size: u64,
    current_date_tag: String,
}

impl LogFileWriter {
    fn new(log_dir: PathBuf) -> Self {
        Self {
            log_dir,
            current_file: None,
            current_file_path: None,
            current_file_size: 0,
            current_date_tag: String::new(),
        }
    }

    /// Ensure a log file is open for the current date.
    fn ensure_open(&mut self) -> std::io::Result<()> {
        let today = Utc::now().format("%Y-%m-%d").to_string();

        if self.current_file.is_some() && self.current_date_tag == today {
            return Ok(());
        }

        // Close previous file if open
        if let Some(ref mut writer) = self.current_file {
            writer.flush()?;
        }

        // Create log directory if needed
        std::fs::create_dir_all(&self.log_dir)?;

        let filename = format!("stratafuse-{}.log", today);
        let filepath = self.log_dir.join(&filename);

        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&filepath)?;

        let metadata = file.metadata()?;
        self.current_file_size = metadata.len();
        self.current_file_path = Some(filepath);
        self.current_file = Some(std::io::BufWriter::new(file));
        self.current_date_tag = today;

        Ok(())
    }

    /// Write a formatted log line to the current file.
    fn write_line(&mut self, entry: &LogEntry) -> std::io::Result<()> {
        self.ensure_open()?;

        let stream_tag = match entry.stream {
            LogStream::Stdout => "OUT",
            LogStream::Stderr => "ERR",
        };

        let formatted = format!(
            "{} [{}] {}\n",
            entry.timestamp.format("%Y-%m-%d %H:%M:%S%.3f"),
            stream_tag,
            entry.line
        );

        if let Some(ref mut writer) = self.current_file {
            writer.write_all(formatted.as_bytes())?;
            self.current_file_size += formatted.len() as u64;
        }

        Ok(())
    }

    /// Flush the current file buffer to disk.
    fn flush(&mut self) -> std::io::Result<()> {
        if let Some(ref mut writer) = self.current_file {
            writer.flush()?;
        }
        Ok(())
    }

    /// Enforce the MaxSizeBytes policy: if the current file exceeds the limit,
    /// truncate it by keeping only the last 50% of content.
    fn enforce_max_size(&mut self, limit: u64) -> std::io::Result<()> {
        if self.current_file_size <= limit {
            return Ok(());
        }

        let Some(ref filepath) = self.current_file_path else {
            return Ok(());
        };

        info!(
            size = self.current_file_size,
            limit, "Log file exceeds size limit, truncating"
        );

        // Close the current writer
        self.current_file = None;

        // Read the file, keep only the last 50%
        let content = std::fs::read_to_string(filepath)?;
        let midpoint = content.len() / 2;

        // Find the first newline after the midpoint to avoid splitting a line
        let trim_point = content[midpoint..]
            .find('\n')
            .map(|pos| midpoint + pos + 1)
            .unwrap_or(midpoint);

        let truncated = &content[trim_point..];
        let truncation_marker = format!(
            "--- LOG TRUNCATED AT {} (policy: MaxSize {}MB) ---\n",
            Utc::now().format("%Y-%m-%d %H:%M:%S"),
            limit / (1024 * 1024)
        );

        let mut new_content = truncation_marker;
        new_content.push_str(truncated);
        std::fs::write(filepath, &new_content)?;

        // Reopen the file for appending
        let file = std::fs::OpenOptions::new().append(true).open(filepath)?;
        self.current_file_size = new_content.len() as u64;
        self.current_file = Some(std::io::BufWriter::new(file));

        Ok(())
    }

    /// Enforce the Hours24 policy: delete log files older than 24 hours.
    fn enforce_hours24(&self) -> std::io::Result<()> {
        let cutoff = Utc::now() - chrono::Duration::hours(24);
        self.delete_files_older_than(cutoff)
    }

    /// Enforce the Days7Rolling policy: delete log files older than 7 days.
    fn enforce_days7(&self) -> std::io::Result<()> {
        let cutoff = Utc::now() - chrono::Duration::days(7);
        self.delete_files_older_than(cutoff)
    }

    /// Delete stratafuse-*.log files whose date tag is before the cutoff.
    fn delete_files_older_than(&self, cutoff: DateTime<Utc>) -> std::io::Result<()> {
        let cutoff_str = cutoff.format("%Y-%m-%d").to_string();

        if !self.log_dir.exists() {
            return Ok(());
        }

        for entry in std::fs::read_dir(&self.log_dir)? {
            let entry = entry?;
            let filename = entry.file_name();
            let name = filename.to_string_lossy();

            // Only process our log files: stratafuse-YYYY-MM-DD.log
            if let Some(date_part) = name
                .strip_prefix("stratafuse-")
                .and_then(|s| s.strip_suffix(".log"))
            {
                if date_part < cutoff_str.as_str() {
                    info!(file = %name, "Deleting old log file");
                    if let Err(e) = std::fs::remove_file(entry.path()) {
                        warn!(file = %name, error = %e, "Failed to delete old log file");
                    }
                }
            }
        }

        Ok(())
    }
}

// ─── Log Manager (shared state) ────────────────────────────────────────────

/// Thread-safe log manager that owns the ring buffer and exposes it to
/// Tauri commands. The file writer runs in a background tokio task.
pub struct LogManager {
    ring: parking_lot::RwLock<LogRingBuffer>,
    policy: parking_lot::RwLock<LogRetentionPolicy>,
    policy_sender: watch::Sender<LogRetentionPolicy>,
    sender: mpsc::UnboundedSender<LogEntry>,
    total_lines: std::sync::atomic::AtomicU64,
    pub log_dir: PathBuf,
}

impl LogManager {
    /// Number of lines to keep in the in-memory ring buffer.
    /// 5000 lines ≈ 500KB of text — fast for UI rendering.
    const RING_CAPACITY: usize = 5000;

    /// How often to flush the file writer and check retention policies.
    const FLUSH_INTERVAL_SECS: u64 = 5;

    /// Create a new LogManager and spawn its background file-writer task.
    ///
    /// The `log_dir` should be within the Tauri app data directory,
    /// e.g. `<app_data>/logs/`.
    pub fn new(log_dir: PathBuf) -> Self {
        let (sender, receiver) = mpsc::unbounded_channel::<LogEntry>();

        let policy = LogRetentionPolicy::default();
        let policy_lock = parking_lot::RwLock::new(policy.clone());

        // Watch channel allows the background writer to observe policy changes
        let (policy_tx, policy_rx) = watch::channel(policy);

        let manager = Self {
            ring: parking_lot::RwLock::new(LogRingBuffer::new(Self::RING_CAPACITY)),
            policy: policy_lock,
            policy_sender: policy_tx,
            sender,
            total_lines: std::sync::atomic::AtomicU64::new(0),
            log_dir: log_dir.clone(),
        };

        Self::spawn_writer_task(receiver, log_dir, policy_rx);

        manager
    }

    /// Ingest a log line from either stdout or stderr.
    ///
    /// Called by the daemon's stream-reading tasks. This is intentionally
    /// non-async and non-blocking: it pushes into the ring buffer directly
    /// and sends to the file-writer channel.
    pub fn ingest(&self, stream: LogStream, line: String, profile_id: Option<String>) {
        let entry = LogEntry {
            timestamp: Utc::now(),
            stream,
            line,
            profile_id,
        };

        // Push to in-memory ring buffer (fast, synchronous)
        self.ring.write().push(entry.clone());
        self.total_lines
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);

        // Send to file-writer task (non-blocking, unbounded channel)
        let _ = self.sender.send(entry);
    }

    /// Get the most recent `count` log entries from the ring buffer or profile file.
    pub fn recent(&self, count: usize, profile_id: Option<String>) -> Vec<LogEntry> {
        if let Some(id) = profile_id {
            let log_path = self.log_dir.join(format!("profile_{}.log", id));
            if !log_path.exists() {
                return Vec::new();
            }

            let file = match std::fs::File::open(&log_path) {
                Ok(f) => f,
                Err(_) => return Vec::new(),
            };

            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(file);
            let mut lines = Vec::new();

            for line in reader.lines() {
                if let Ok(line_str) = line {
                    if !line_str.trim().is_empty() {
                        lines.push(line_str);
                    }
                }
            }

            let start = if lines.len() > count {
                lines.len() - count
            } else {
                0
            };

            let mut entries = Vec::new();
            for line_str in &lines[start..] {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(line_str) {
                    let timestamp = json_val.get("time")
                        .and_then(|v| v.as_str())
                        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
                        .map(|dt| dt.with_timezone(&Utc))
                        .unwrap_or_else(Utc::now);

                    let level = json_val.get("level")
                        .and_then(|v| v.as_str())
                        .unwrap_or("info");

                    let stream = if level == "error" {
                        LogStream::Stderr
                    } else {
                        LogStream::Stdout
                    };

                    let msg = json_val.get("msg")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| line_str.clone());

                    entries.push(LogEntry {
                        timestamp,
                        stream,
                        line: msg,
                        profile_id: Some(id.clone()),
                    });
                } else {
                    entries.push(LogEntry {
                        timestamp: Utc::now(),
                        stream: LogStream::Stdout,
                        line: line_str.clone(),
                        profile_id: Some(id.clone()),
                    });
                }
            }

            entries
        } else {
            let today = Utc::now().format("%Y-%m-%d").to_string();
            let log_path = self.log_dir.join(format!("stratafuse-{}.log", today));
            if !log_path.exists() {
                return Vec::new();
            }

            let file = match std::fs::File::open(&log_path) {
                Ok(f) => f,
                Err(_) => return Vec::new(),
            };

            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(file);
            let mut entries = Vec::new();

            for line in reader.lines() {
                if let Ok(line_str) = line {
                    if line_str.len() > 25 {
                        let date_part = &line_str[..23];
                        let timestamp = DateTime::parse_from_str(&(date_part.to_string() + " +0000"), "%Y-%m-%d %H:%M:%S%.3f %z")
                            .map(|dt| dt.with_timezone(&Utc))
                            .unwrap_or_else(|_| Utc::now());

                        let stream = if line_str.contains("[ERR]") {
                            LogStream::Stderr
                        } else {
                            LogStream::Stdout
                        };

                        let content = if let Some(idx) = line_str.find("] ") {
                            &line_str[idx + 2..]
                        } else {
                            &line_str[25..]
                        };

                        entries.push(LogEntry {
                            timestamp,
                            stream,
                            line: content.to_string(),
                            profile_id: None,
                        });
                    } else {
                        entries.push(LogEntry {
                            timestamp: Utc::now(),
                            stream: LogStream::Stdout,
                            line: line_str.clone(),
                            profile_id: None,
                        });
                    }
                }
            }

            if entries.len() > count {
                let start = entries.len() - count;
                entries[start..].to_vec()
            } else {
                entries
            }
        }
    }

    /// Total lines ingested since application start.
    pub fn total_lines(&self) -> u64 {
        self.total_lines
            .load(std::sync::atomic::Ordering::Relaxed)
    }

    /// Get the current retention policy.
    pub fn get_policy(&self) -> LogRetentionPolicy {
        self.policy.read().clone()
    }

    /// Update the retention policy at runtime.
    pub fn set_policy(&self, policy: LogRetentionPolicy) {
        info!(%policy, "Log retention policy updated");
        *self.policy.write() = policy.clone();
        // Propagate to the background writer task via watch channel
        let _ = self.policy_sender.send(policy);
    }

    /// Clear the in-memory ring buffer (does not affect files on disk).
    pub fn clear_ring(&self) {
        self.ring.write().clear();
    }

    /// Spawn the background file-writer task.
    ///
    /// This task:
    /// 1. Receives LogEntry items from the mpsc channel
    /// 2. Writes each to the current day's log file
    /// 3. Periodically flushes and enforces the retention policy
    fn spawn_writer_task(
        mut receiver: mpsc::UnboundedReceiver<LogEntry>,
        log_dir: PathBuf,
        policy_rx: watch::Receiver<LogRetentionPolicy>,
    ) {
        tauri::async_runtime::spawn(async move {
            let mut writer = LogFileWriter::new(log_dir);
            let mut flush_interval =
                tokio::time::interval(std::time::Duration::from_secs(Self::FLUSH_INTERVAL_SECS));
            // Don't immediately tick on creation
            flush_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);

            loop {
                tokio::select! {
                    // Receive and write log entries
                    entry = receiver.recv() => {
                        match entry {
                            Some(entry) => {
                                if let Err(e) = writer.write_line(&entry) {
                                    error!(error = %e, "Failed to write log entry to file");
                                }
                            }
                            None => {
                                // Channel closed — LogManager was dropped, shut down
                                info!("Log writer channel closed, flushing and exiting");
                                let _ = writer.flush();
                                break;
                            }
                        }
                    }

                    // Periodic flush + policy enforcement
                    _ = flush_interval.tick() => {
                        if let Err(e) = writer.flush() {
                            error!(error = %e, "Failed to flush log file");
                        }

                        // Read current policy from watch channel (reflects runtime changes)
                        let current_policy = policy_rx.borrow().clone();

                        // Enforce retention policy
                        let result = match &current_policy {
                            LogRetentionPolicy::MaxSizeBytes { limit } => {
                                writer.enforce_max_size(*limit)
                            }
                            LogRetentionPolicy::Hours24 => {
                                writer.enforce_hours24()
                            }
                            LogRetentionPolicy::Days7Rolling => {
                                writer.enforce_days7()
                            }
                        };

                        if let Err(e) = result {
                            warn!(
                                error = %e,
                                policy = %current_policy,
                                "Failed to enforce log retention policy"
                            );
                        }
                    }
                }
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ring_buffer_capacity_enforcement() {
        let mut ring = LogRingBuffer::new(3);
        for i in 0..5 {
            ring.push(LogEntry {
                timestamp: Utc::now(),
                stream: LogStream::Stdout,
                line: format!("line {}", i),
            });
        }
        assert_eq!(ring.len(), 3);
        let recent = ring.recent(10);
        assert_eq!(recent.len(), 3);
        assert_eq!(recent[0].line, "line 2");
        assert_eq!(recent[2].line, "line 4");
    }

    #[test]
    fn ring_buffer_recent_returns_last_n() {
        let mut ring = LogRingBuffer::new(100);
        for i in 0..50 {
            ring.push(LogEntry {
                timestamp: Utc::now(),
                stream: LogStream::Stdout,
                line: format!("line {}", i),
            });
        }
        let recent = ring.recent(5);
        assert_eq!(recent.len(), 5);
        assert_eq!(recent[0].line, "line 45");
        assert_eq!(recent[4].line, "line 49");
    }

    #[test]
    fn default_policy_is_max_25mb() {
        let policy = LogRetentionPolicy::default();
        assert_eq!(
            policy,
            LogRetentionPolicy::MaxSizeBytes {
                limit: 25 * 1024 * 1024
            }
        );
    }

    #[test]
    fn policy_display() {
        assert_eq!(LogRetentionPolicy::Hours24.to_string(), "24 Hours Only");
        assert_eq!(
            LogRetentionPolicy::Days7Rolling.to_string(),
            "7 Days Rolling"
        );
        assert_eq!(
            LogRetentionPolicy::MaxSizeBytes {
                limit: 25 * 1024 * 1024
            }
            .to_string(),
            "Max 25MB Auto-Truncate"
        );
    }
}
