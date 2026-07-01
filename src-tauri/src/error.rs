use serde::Serialize;

/// Application-wide error type.
///
/// Implements `Serialize` so it can be returned from `#[tauri::command]`
/// functions as the `Err` variant of `Result<T, AppError>`.
#[derive(Debug, thiserror::Error, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "message")]
pub enum AppError {
    /// rclone daemon lifecycle errors.
    #[error("Daemon error: {0}")]
    Daemon(String),

    /// HTTP/network errors when communicating with the RC API.
    #[error("HTTP error: {0}")]
    Http(String),

    /// rclone RC API returned a non-success response.
    #[error("RC API error: {0}")]
    RcApi(String),

    /// Invalid user input or configuration.
    #[error("Invalid input: {0}")]
    InvalidInput(String),

    /// File I/O errors.
    #[error("IO error: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err.to_string())
    }
}
