//! SSH module — russh-based SSH client
//! Architecture: handle stays in session for exec/SFTP, channel goes to shell task

use crate::error::{AppError, AppResult, ErrorCode};
use once_cell::sync::Lazy;
use russh::client;
use russh::ChannelMsg;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, Mutex};
use tauri::{AppHandle, Emitter};

// ============================================================
// Types
// ============================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectConfig {
    pub host: String,
    #[serde(default = "default_port")]
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
fn default_port() -> u16 { 22 }
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
// Handler
// ============================================================

#[derive(Clone)]
struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = anyhow::Error;
    async fn check_server_key(&mut self, _key: &russh_keys::key::PublicKey) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ============================================================
// Session storage
// ============================================================

enum ShellCmd { Data(Vec<u8>), Resize(u32, u32), Close }

struct SshSession {
    #[allow(dead_code)]
    config: SshConnectConfig,
    handle: Option<client::Handle<SshHandler>>,
    cmd_tx: Option<mpsc::UnboundedSender<ShellCmd>>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, SshSession>>> = Lazy::new(|| Mutex::new(HashMap::new()));

fn gen_id() -> String {
    format!("ssh-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos())
}

fn emit_status(app: &AppHandle, sid: &str, status: &str, error: &str) {
    let _ = app.emit("ssh-status", serde_json::json!({ "sessionId": sid, "status": status, "error": error }));
}

fn emit_data(app: &AppHandle, sid: &str, data: &[u8]) {
    let text = String::from_utf8_lossy(data).to_string();
    if text.is_empty() { return; }
    let _ = app.emit("ssh-data", serde_json::json!({ "sessionId": sid, "data": text }));
}

// ============================================================
// Shell channel task (owns channel, not handle)
// ============================================================

async fn shell_task(
    mut channel: russh::Channel<russh::client::Msg>,
    session_id: String,
    mut cmd_rx: mpsc::UnboundedReceiver<ShellCmd>,
    app: AppHandle,
) {
    emit_status(&app, &session_id, "connected", "");

    loop {
        // Process queued commands
        loop {
            match cmd_rx.try_recv() {
                Ok(ShellCmd::Data(data)) => {
                    if channel.data(&data[..]).await.is_err() { return; }
                }
                Ok(ShellCmd::Resize(c, r)) => {
                    channel.window_change(c, r, 0, 0).await.ok();
                }
                Ok(ShellCmd::Close) => {
                    channel.close().await.ok();
                    emit_status(&app, &session_id, "disconnected", "");
                    return;
                }
                Err(mpsc::error::TryRecvError::Empty) => break,
                Err(mpsc::error::TryRecvError::Disconnected) => { return; }
            }
        }

        // Read from channel
        match channel.wait().await {
            Some(ChannelMsg::Data { data }) => emit_data(&app, &session_id, &data),
            Some(ChannelMsg::ExitStatus { .. }) | Some(ChannelMsg::Eof) | None => {
                emit_status(&app, &session_id, "disconnected", "");
                return;
            }
            _ => {}
        }
    }
}

// ============================================================
// Public API
// ============================================================

pub async fn ssh_test_connect(config: &SshConnectConfig) -> AppResult<SshTestResult> {
    let start = std::time::Instant::now();
    let cfg = Arc::new(client::Config::default());

    let mut session = match client::connect(cfg, (config.host.as_str(), config.port), SshHandler).await {
        Ok(s) => s,
        Err(e) => {
            let err = e.to_string().to_lowercase();
            let etype = if err.contains("refused") { SshTestErrorType::PortUnreachable }
                       else if err.contains("timeout") { SshTestErrorType::FirewallBlocked }
                       else { SshTestErrorType::PortUnreachable };
            return Ok(SshTestResult { reachable: false, error_type: Some(etype), error_message: Some(e.to_string()), latency_ms: None });
        }
    };

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => session.authenticate_password(&config.username, password).await.unwrap_or(false),
        SshAuthMethod::PrivateKey { key_path, passphrase } => {
            match russh_keys::load_secret_key(key_path, passphrase.as_deref()) {
                Ok(key) => session.authenticate_publickey(&config.username, Arc::new(key)).await.unwrap_or(false),
                Err(e) => return Ok(SshTestResult { reachable: false, error_type: Some(SshTestErrorType::InvalidKey), error_message: Some(format!("Key load error: {}", e)), latency_ms: None }),
            }
        }
        SshAuthMethod::Agent => false,
    };

    let latency = start.elapsed().as_millis() as u64;
    Ok(if auth_ok {
        SshTestResult { reachable: true, error_type: None, error_message: None, latency_ms: Some(latency) }
    } else {
        SshTestResult { reachable: false, error_type: Some(SshTestErrorType::AuthFailed), error_message: Some("Authentication rejected".into()), latency_ms: Some(latency) }
    })
}

pub async fn connect(config: SshConnectConfig) -> AppResult<SshSessionInfo> {
    let cfg = Arc::new(client::Config::default());
    let mut handle = client::connect(cfg, (config.host.as_str(), config.port), SshHandler).await
        .map_err(|e| AppError::with_source(ErrorCode::SshHandshakeFailed, "TCP handshake failed", e.to_string()))?;

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => {
            handle.authenticate_password(&config.username, password).await
                .map_err(|e| AppError::with_source(ErrorCode::SshAuthFailed, "Auth failed", e.to_string()))?
        }
        SshAuthMethod::PrivateKey { key_path, passphrase } => {
            let key = russh_keys::load_secret_key(key_path, passphrase.as_deref())
                .map_err(|e| AppError::with_source(ErrorCode::SshAuthFailed, "Cannot load key", e.to_string()))?;
            handle.authenticate_publickey(&config.username, Arc::new(key)).await
                .map_err(|e| AppError::with_source(ErrorCode::SshAuthFailed, "Key auth failed", e.to_string()))?
        }
        SshAuthMethod::Agent => return Err(AppError::new(ErrorCode::SshAuthFailed, "SSH agent not implemented")),
    };

    if !auth_ok { return Err(AppError::new(ErrorCode::SshAuthFailed, "Authentication rejected")); }

    let id = gen_id();
    SESSIONS.lock().await.insert(id.clone(), SshSession { config: config.clone(), handle: Some(handle), cmd_tx: None });
    Ok(SshSessionInfo { session_id: id, config, state: SshSessionState::Connected })
}

/// Open interactive shell — opens channel using handle, then hands channel to background task
/// Handle REMAINS in session for exec/SFTP operations
pub async fn open_shell(app: AppHandle, session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
    let mut sessions = SESSIONS.lock().await;
    let session = sessions.get_mut(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;

    let handle = session.handle.as_mut()
        .ok_or_else(|| AppError::new(ErrorCode::SshChannelOpenFailed, "Handle not available"))?;

    // Open channel using borrowed handle
    let mut channel = handle.channel_open_session().await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Channel open: {}", e)))?;

    channel.request_pty(true, "xterm-256color", cols, rows, 0, 0, &[]).await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("PTY: {}", e)))?;

    channel.request_shell(true).await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Shell: {}", e)))?;

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    session.cmd_tx = Some(cmd_tx);

    let sid = session_id.to_string();
    tokio::spawn(shell_task(channel, sid, cmd_rx, app));

    Ok(())
}

pub async fn write_to_shell(session_id: &str, data: &[u8]) -> AppResult<()> {
    let sessions = SESSIONS.lock().await;
    let session = sessions.get(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
    match &session.cmd_tx {
        Some(tx) => tx.send(ShellCmd::Data(data.to_vec())).map_err(|_| AppError::new(ErrorCode::SshChannelOpenFailed, "Shell closed"))?,
        None => return Err(AppError::new(ErrorCode::SshChannelOpenFailed, "No shell open")),
    }
    Ok(())
}

pub async fn resize_shell(session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
    let sessions = SESSIONS.lock().await;
    let session = sessions.get(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
    if let Some(tx) = &session.cmd_tx { tx.send(ShellCmd::Resize(cols, rows)).ok(); }
    Ok(())
}

/// Execute single command via exec channel — uses handle stored in session
pub async fn exec_command(session_id: &str, command: &str) -> AppResult<String> {
    let mut sessions = SESSIONS.lock().await;
    let session = sessions.get_mut(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;

    let handle = session.handle.as_mut()
        .ok_or_else(|| AppError::new(ErrorCode::SshChannelOpenFailed, "Handle not available"))?;

    let mut channel = handle.channel_open_session().await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Exec channel: {}", e)))?;

    channel.exec(true, command).await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Exec: {}", e)))?;

    let mut output = String::new();
    loop {
        match channel.wait().await {
            Some(ChannelMsg::Data { ref data }) => output.push_str(&String::from_utf8_lossy(data)),
            Some(ChannelMsg::Eof) | None => break,
            _ => {}
        }
    }
    channel.close().await.ok();
    Ok(output)
}

pub async fn disconnect(session_id: &str) -> AppResult<()> {
    let mut sessions = SESSIONS.lock().await;
    if let Some(s) = sessions.get(session_id) {
        if let Some(tx) = &s.cmd_tx { tx.send(ShellCmd::Close).ok(); }
    }
    sessions.remove(session_id);
    Ok(())
}
