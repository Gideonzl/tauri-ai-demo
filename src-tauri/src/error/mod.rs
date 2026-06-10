//! Unified error enum module
//! All backend errors are encapsulated here, shared error codes between frontend and backend

use serde::{Deserialize, Serialize};
use std::fmt;

/// Global error code enum
/// Frontend matches error_code for precise prompt text
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[repr(i32)]
pub enum ErrorCode {
    // General 1-19
    Unknown = 1,
    InvalidParam = 2,
    IoError = 3,
    SerializeError = 4,
    ReadFailed = 5,
    WriteFailed = 6,

    // Crypto 20-39
    EncryptFailed = 20,
    DecryptFailed = 21,
    InvalidKeyFormat = 22,

    // Config 40-59
    ConfigNotFound = 40,
    ConfigParseFailed = 41,
    DataWriteFailed = 42,
    DataReadFailed = 43,

    // Network 60-79
    NetworkTimeout = 60,
    ConnectionRefused = 61,
    DnsResolveFailed = 62,
    ProxyConnectFailed = 63,

    // AI 80-99
    AiRequestFailed = 80,
    AiTokenInvalid = 81,
    AiStreamInterrupted = 82,
    AiModelUnavailable = 83,

    // SSH 100-119
    SshHandshakeFailed = 100,
    SshAuthFailed = 101,
    SshChannelOpenFailed = 102,
    SshSessionTimeout = 103,
    SshPortUnreachable = 104,
    SshInvalidKey = 105,
    SshFirewallBlocked = 106,

    // SFTP 120-139
    SftpChannelOpenFailed = 120,
    SftpReadDirFailed = 121,
    SftpFileOpFailed = 122,
    SftpUploadFailed = 123,
    SftpDownloadFailed = 124,

    // RDP 140-159
    RdpConnectFailed = 140,
    RdpAuthFailed = 141,
    RdpDecodeFailed = 142,
}

/// Application unified error type
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppError {
    pub error_code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl AppError {
    /// Create error with message (accepts &str)
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            error_code: code,
            message: message.into(),
            source: None,
        }
    }

    /// Create error with source detail
    pub fn with_source(code: ErrorCode, message: &str, source: String) -> Self {
        Self {
            error_code: code,
            message: message.to_string(),
            source: Some(source),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.source {
            Some(s) => write!(f, "[{}] {} ({})", self.error_code as i32, self.message, s),
            None => write!(f, "[{}] {}", self.error_code as i32, self.message),
        }
    }
}

impl std::error::Error for AppError {}

/// Unified Result type
pub type AppResult<T> = Result<T, AppError>;

/// Convert std::io::Error to AppError
impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        Self::with_source(ErrorCode::IoError, "IO error", e.to_string())
    }
}

/// Convert serde_json::Error to AppError
impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        Self::with_source(ErrorCode::SerializeError, "JSON error", e.to_string())
    }
}
