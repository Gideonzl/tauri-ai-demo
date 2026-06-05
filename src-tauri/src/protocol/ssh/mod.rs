//! SSH protocol module — pure Rust SSH via russh (no C dependencies)
//! Uses tokio::sync::Mutex for Send-safe async access

use crate::error::{AppError, AppResult, ErrorCode};
use once_cell::sync::Lazy;
use russh::client;
use russh::ChannelMsg;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

// ============================================================
// Data types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectConfig {
    pub host: String,
    #[serde(default = "default_ssh_port")]
    pub port: u16,
    pub username: String,
    pub auth: SshAuthMethod,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub remark: String,
    #[serde(default)]
    pub pinned: bool,
}

fn default_ssh_port() -> u16 { 22 }
fn default_timeout() -> u64 { 10000 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuthMethod {
    Password { password: String },
    PrivateKey { key_path: String, passphrase: Option<String> },
    Agent,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SshSessionState { Disconnected, Handshaking, Authenticating, Connected, Failed, Closed }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshSessionInfo {
    pub session_id: String,
    pub config: SshConnectConfig,
    pub state: SshSessionState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshTestResult {
    pub reachable: bool,
    pub error_type: Option<SshTestErrorType>,
    pub error_message: Option<String>,
    pub latency_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SshTestErrorType { PortUnreachable, AuthFailed, InvalidKey, FirewallBlocked }

// ============================================================
// russh handler
// ============================================================

#[derive(Clone)]
struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = anyhow::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ============================================================
// Connection manager — tokio::sync::Mutex for async safety
// ============================================================

/// A stored SSH session (handle is Clone, Arc-wrapped internally by russh)
struct SshConnection {
    config: SshConnectConfig,
    handle: client::Handle<SshHandler>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, SshConnection>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn gen_session_id() -> String {
    format!("ssh-{}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos())
}

// ============================================================
// SSH operations
// ============================================================

/// Exec a command on given handle (no lock held)
async fn exec_on_handle(handle: &mut client::Handle<SshHandler>, command: &str) -> AppResult<String> {
    let mut channel = handle.channel_open_session().await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("channel: {}", e)))?;

    channel.exec(true, command).await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("exec: {}", e)))?;

    let mut output = String::new();
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => {
                output.push_str(&String::from_utf8_lossy(data));
            }
            Some(ChannelMsg::Eof) | None => break,
            _ => {} // Continue on Success, Failure, etc.
        }
    }
    channel.close().await.ok();
    Ok(output)
}

/// Test SSH connectivity
pub async fn ssh_test_connect(config: &SshConnectConfig) -> AppResult<SshTestResult> {
    let start = std::time::Instant::now();
    let cfg = Arc::new(client::Config::default());

    let mut session = match client::connect(cfg, (config.host.as_str(), config.port), SshHandler).await {
        Ok(s) => s,
        Err(e) => {
            let err = e.to_string();
            let etype = if err.contains("refused") { SshTestErrorType::PortUnreachable }
                       else if err.contains("timeout") { SshTestErrorType::FirewallBlocked }
                       else { SshTestErrorType::PortUnreachable };
            return Ok(SshTestResult { reachable: false, error_type: Some(etype), error_message: Some(format!("{}", e)), latency_ms: None });
        }
    };

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => session.authenticate_password(&config.username, password).await.unwrap_or(false),
        _ => false,
    };

    if auth_ok {
        Ok(SshTestResult { reachable: true, error_type: None, error_message: None, latency_ms: Some(start.elapsed().as_millis() as u64) })
    } else {
        Ok(SshTestResult { reachable: false, error_type: Some(SshTestErrorType::AuthFailed), error_message: Some("Auth failed".into()), latency_ms: None })
    }
}

/// Connect and store session
pub async fn connect(config: SshConnectConfig) -> AppResult<SshSessionInfo> {
    let cfg = Arc::new(client::Config::default());
    let mut handle = client::connect(cfg, (config.host.as_str(), config.port), SshHandler).await
        .map_err(|e| AppError::with_source(ErrorCode::SshHandshakeFailed, "Connect failed", e.to_string()))?;

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => handle.authenticate_password(&config.username, password).await
            .map_err(|e| AppError::with_source(ErrorCode::SshAuthFailed, "Auth failed", e.to_string()))?,
        _ => return Err(AppError::new(ErrorCode::SshAuthFailed, "Only password auth supported")),
    };

    if !auth_ok {
        return Err(AppError::new(ErrorCode::SshAuthFailed, "Authentication rejected"));
    }

    let session_id = gen_session_id();
    SESSIONS.lock().await.insert(session_id.clone(), SshConnection { config: config.clone(), handle });

    Ok(SshSessionInfo { session_id, config, state: SshSessionState::Connected })
}

/// Disconnect
pub async fn disconnect(session_id: &str) -> AppResult<()> {
    SESSIONS.lock().await.remove(session_id);
    Ok(())
}

/// Execute command — hold tokio lock across await (guard is Send)
pub async fn exec_command(session_id: &str, command: &str) -> AppResult<String> {
    let mut sessions = SESSIONS.lock().await;
    let conn = sessions.get_mut(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
    exec_on_handle(&mut conn.handle, command).await
}
