//! SSH module — russh-based SSH client
//! Architecture: handle stays in session for exec/SFTP, channel goes to shell task

use crate::error::{AppError, AppResult, ErrorCode};
use once_cell::sync::Lazy;
use russh::client;
use russh::ChannelMsg;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::{mpsc, oneshot, Mutex};

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
fn default_port() -> u16 {
    22
}
fn default_timeout() -> u64 {
    10000
}

/// Normalize a user-entered private-key path before it reaches russh.
/// `russh_keys` receives a literal path, so a common `~/.ssh/id_ed25519`
/// entry otherwise fails on Windows and Unix alike.
fn normalize_key_path(key_path: &str) -> String {
    let raw = key_path.trim().trim_matches('"');
    if raw == "~" || raw.starts_with("~/") || raw.starts_with("~\\") {
        let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
        if let Some(home) = home {
            let suffix = raw[1..].trim_start_matches(['/', '\\']);
            return PathBuf::from(home)
                .join(suffix)
                .to_string_lossy()
                .into_owned();
        }
    }
    raw.to_owned()
}

#[cfg(test)]
mod key_path_tests {
    use super::normalize_key_path;

    #[test]
    fn expands_tilde_private_key_path() {
        let resolved = normalize_key_path("~/.ssh/id_ed25519");
        assert!(!resolved.starts_with('~'));
        assert!(resolved.ends_with(".ssh/id_ed25519") || resolved.ends_with(".ssh\\id_ed25519"));
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum SshAuthMethod {
    Password {
        password: String,
    },
    PrivateKey {
        #[serde(default)]
        key_path: String,
        /// Provided for a direct test connection only, or hydrated from the
        /// encrypted local vault before establishing a persisted connection.
        #[serde(default)]
        key_content: Option<String>,
        #[serde(default)]
        key_ref: Option<String>,
        #[serde(default)]
        passphrase: Option<String>,
    },
    Agent,
}

fn load_private_key(
    key_path: &str,
    key_content: Option<&str>,
    passphrase: Option<&str>,
) -> Result<russh_keys::key::KeyPair, russh_keys::Error> {
    if let Some(content) = key_content.filter(|value| !value.trim().is_empty()) {
        russh_keys::decode_secret_key(content, passphrase)
    } else {
        russh_keys::load_secret_key(&normalize_key_path(key_path), passphrase)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum SshSessionState {
    Disconnected,
    Handshaking,
    Authenticating,
    Connected,
    Failed,
    Closed,
}

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
pub enum SshTestErrorType {
    PortUnreachable,
    AuthFailed,
    InvalidKey,
    FirewallBlocked,
}

// ============================================================
// Handler
// ============================================================

#[derive(Clone)]
struct SshHandler;

#[async_trait::async_trait]
impl client::Handler for SshHandler {
    type Error = anyhow::Error;
    async fn check_server_key(
        &mut self,
        _key: &russh_keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

// ============================================================
// Session storage
// ============================================================

enum ShellCmd {
    /// A write is acknowledged only after russh accepts it for the active PTY.
    /// This prevents a stale, half-open channel from silently swallowing input.
    Data(Vec<u8>, oneshot::Sender<AppResult<()>>),
    Resize(u32, u32),
    Close,
    Replace,
}

struct SshSession {
    #[allow(dead_code)]
    config: SshConnectConfig,
    handle: Option<client::Handle<SshHandler>>,
    cmd_tx: Option<mpsc::UnboundedSender<ShellCmd>>,
    pty_size: Option<(u32, u32)>,
}

static SESSIONS: Lazy<Mutex<HashMap<String, SshSession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

fn gen_id() -> String {
    format!(
        "ssh-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    )
}

fn emit_status(app: &AppHandle, sid: &str, status: &str, error: &str) {
    let _ = app.emit(
        "ssh-status",
        serde_json::json!({ "sessionId": sid, "status": status, "error": error }),
    );
}

/// The exec and PTY APIs share one russh handle. An exec operation temporarily
/// owns it while opening a channel, so a simultaneous terminal startup must
/// wait for that short critical section instead of reporting a false
/// "Handle not available" connection failure.
async fn take_session_handle(session_id: &str) -> AppResult<client::Handle<SshHandler>> {
    // Exec channel creation can wait up to 12 seconds, so the PTY queue must
    // outlive that normal critical section instead of misreporting it as a
    // failed connection on a slow server.
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(15);

    loop {
        let handle = {
            let mut sessions = SESSIONS.lock().await;
            let session = sessions
                .get_mut(session_id)
                .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
            session.handle.take()
        };

        if let Some(handle) = handle {
            return Ok(handle);
        }
        if tokio::time::Instant::now() >= deadline {
            return Err(AppError::new(
                ErrorCode::SshChannelOpenFailed,
                "SSH session stayed busy while opening another channel",
            ));
        }
        tokio::time::sleep(std::time::Duration::from_millis(25)).await;
    }
}

async fn restore_session_handle(
    session_id: &str,
    handle: client::Handle<SshHandler>,
) -> AppResult<()> {
    let mut sessions = SESSIONS.lock().await;
    let session = sessions.get_mut(session_id).ok_or_else(|| {
        AppError::new(
            ErrorCode::SshSessionTimeout,
            "Session removed while opening SSH channel",
        )
    })?;
    // Do not overwrite a newer handle that may have been installed by a
    // reconnect while this older operation was still completing.
    if session.handle.is_none() {
        session.handle = Some(handle);
    }
    Ok(())
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
        tokio::select! {
            cmd = cmd_rx.recv() => {
                match cmd {
                    Some(ShellCmd::Data(data, reply)) => {
                        let result = channel.data(&data[..]).await
                            .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("PTY write: {}", e)));
                        let failed = result.is_err();
                        let error = result.as_ref().err().map(|e| e.message.as_str()).unwrap_or("").to_owned();
                        let _ = reply.send(result);
                        if failed {
                            // Do not report a final disconnect here: the caller immediately
                            // recreates the transport and PTY, preserving the terminal tab.
                            emit_status(&app, &session_id, "reconnecting", &error);
                            return;
                        }
                    }
                    Some(ShellCmd::Resize(c, r)) => { channel.window_change(c, r, 0, 0).await.ok(); }
                    Some(ShellCmd::Replace) => { channel.close().await.ok(); return; }
                    Some(ShellCmd::Close) | None => { channel.close().await.ok(); emit_status(&app, &session_id, "disconnected", ""); return; }
                }
            }
            msg = channel.wait() => {
                match msg {
                    Some(ChannelMsg::Data { data }) => { let _ = app.emit("ssh-data", serde_json::json!({ "sessionId": &session_id, "data": String::from_utf8_lossy(&data) })); }
                    // Servers and NAT devices may close an idle PTY while the
                    // terminal tab is still open. Keep the frontend session
                    // alive so the next input can transparently rebuild it.
                    Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => { emit_status(&app, &session_id, "reconnecting", "SSH PTY became idle and will be restored on input"); return; }
                    _ => {}
                }
            }
        }
    }
}

// ============================================================
// Public API
// ============================================================

pub async fn ssh_test_connect(config: &SshConnectConfig) -> AppResult<SshTestResult> {
    let start = std::time::Instant::now();
    let cfg = Arc::new(build_client_config());
    let timeout = std::time::Duration::from_millis(config.timeout_ms.max(5000));

    let mut session = match tokio::time::timeout(
        timeout,
        client::connect(cfg, (config.host.as_str(), config.port), SshHandler),
    )
    .await
    {
        Ok(Ok(session)) => session,
        Ok(Err(e)) => {
            let err = e.to_string().to_lowercase();
            let etype = if err.contains("refused") {
                SshTestErrorType::PortUnreachable
            } else if err.contains("timeout") {
                SshTestErrorType::FirewallBlocked
            } else {
                SshTestErrorType::PortUnreachable
            };
            return Ok(SshTestResult {
                reachable: false,
                error_type: Some(etype),
                error_message: Some(e.to_string()),
                latency_ms: None,
            });
        }
        Err(_) => {
            return Ok(SshTestResult {
                reachable: false,
                error_type: Some(SshTestErrorType::FirewallBlocked),
                error_message: Some("Connection test timed out".into()),
                latency_ms: None,
            })
        }
    };

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => session
            .authenticate_password(&config.username, password)
            .await
            .unwrap_or(false),
        SshAuthMethod::PrivateKey {
            key_path,
            key_content,
            passphrase,
            ..
        } => match load_private_key(key_path, key_content.as_deref(), passphrase.as_deref()) {
            Ok(key) => session
                .authenticate_publickey(&config.username, Arc::new(key))
                .await
                .unwrap_or(false),
            Err(e) => {
                return Ok(SshTestResult {
                    reachable: false,
                    error_type: Some(SshTestErrorType::InvalidKey),
                    error_message: Some(format!("Key load error: {}", e)),
                    latency_ms: None,
                })
            }
        },
        SshAuthMethod::Agent => false,
    };

    let latency = start.elapsed().as_millis() as u64;
    Ok(if auth_ok {
        SshTestResult {
            reachable: true,
            error_type: None,
            error_message: None,
            latency_ms: Some(latency),
        }
    } else {
        SshTestResult {
            reachable: false,
            error_type: Some(SshTestErrorType::AuthFailed),
            error_message: Some("Authentication rejected".into()),
            latency_ms: Some(latency),
        }
    })
}

/// Build a client config WITH keepalive enabled.
///
/// The default russh config sends no keepalive, so an idle SSH connection
/// (while the user is chatting with the AI, or the AI is "thinking") gets
/// silently dropped by NAT / stateful firewalls. russh never notices, and the
/// next command hangs on a half-open socket — surfacing to the user as
/// "no output / connection dropped". A 15s keepalive with up to 4 misses
/// (~60s grace) keeps the tunnel warm and lets russh detect a real death fast.
fn build_client_config() -> client::Config {
    client::Config {
        keepalive_interval: Some(std::time::Duration::from_secs(15)),
        keepalive_max: 4,
        // Never garbage-collect a connection that is merely idle-but-alive.
        inactivity_timeout: None,
        ..Default::default()
    }
}

/// TCP connect + authenticate, returning a live handle.
/// Shared by the initial `connect()` and the transparent `reconnect_session()`
/// so both paths get identical keepalive + timeout behavior.
async fn establish_handle(config: &SshConnectConfig) -> AppResult<client::Handle<SshHandler>> {
    let cfg = Arc::new(build_client_config());
    let connect_fut = client::connect(cfg, (config.host.as_str(), config.port), SshHandler);
    let dur = std::time::Duration::from_millis(config.timeout_ms.max(5000));
    let mut handle = match tokio::time::timeout(dur, connect_fut).await {
        Ok(Ok(h)) => h,
        Ok(Err(e)) => {
            return Err(AppError::with_source(
                ErrorCode::SshHandshakeFailed,
                "TCP handshake failed",
                e.to_string(),
            ))
        }
        Err(_) => {
            return Err(AppError::new(
                ErrorCode::SshHandshakeFailed,
                "TCP handshake timed out",
            ))
        }
    };

    let auth_ok = match &config.auth {
        SshAuthMethod::Password { password } => handle
            .authenticate_password(&config.username, password)
            .await
            .map_err(|e| {
                AppError::with_source(ErrorCode::SshAuthFailed, "Auth failed", e.to_string())
            })?,
        SshAuthMethod::PrivateKey {
            key_path,
            key_content,
            passphrase,
            ..
        } => {
            let key = load_private_key(key_path, key_content.as_deref(), passphrase.as_deref())
                .map_err(|e| {
                    AppError::with_source(
                        ErrorCode::SshAuthFailed,
                        "Cannot load key",
                        e.to_string(),
                    )
                })?;
            handle
                .authenticate_publickey(&config.username, Arc::new(key))
                .await
                .map_err(|e| {
                    AppError::with_source(
                        ErrorCode::SshAuthFailed,
                        "Key auth failed",
                        e.to_string(),
                    )
                })?
        }
        SshAuthMethod::Agent => {
            return Err(AppError::new(
                ErrorCode::SshAuthFailed,
                "SSH agent not implemented",
            ))
        }
    };

    if !auth_ok {
        return Err(AppError::new(
            ErrorCode::SshAuthFailed,
            "Authentication rejected",
        ));
    }
    Ok(handle)
}

pub async fn connect(config: SshConnectConfig) -> AppResult<SshSessionInfo> {
    let handle = establish_handle(&config).await?;
    let id = gen_id();
    SESSIONS.lock().await.insert(
        id.clone(),
        SshSession {
            config: config.clone(),
            handle: Some(handle),
            cmd_tx: None,
            pty_size: None,
        },
    );
    Ok(SshSessionInfo {
        session_id: id,
        config,
        state: SshSessionState::Connected,
    })
}

/// Re-establish a dead session's handle in place, reusing the stored config
/// (which already holds the credentials).
/// This is what makes command execution self-healing: the AI never has to ask
/// the user to reconnect or re-run anything by hand.
async fn reconnect_session(session_id: &str) -> AppResult<()> {
    // Snapshot the config first — don't hold the lock across the network round-trip.
    let config = {
        let sessions = SESSIONS.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
        session.config.clone()
    };

    let handle = establish_handle(&config).await?;

    let mut sessions = SESSIONS.lock().await;
    let session = sessions.get_mut(session_id).ok_or_else(|| {
        AppError::new(
            ErrorCode::SshSessionTimeout,
            "Session removed during reconnect",
        )
    })?;
    session.handle = Some(handle);
    Ok(())
}

/// Open interactive shell — opens channel using handle, then hands channel to background task
/// Handle REMAINS in session for exec/SFTP operations
pub async fn open_shell(app: AppHandle, session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
    let handle = take_session_handle(session_id).await?;
    let channel_result: AppResult<russh::Channel<russh::client::Msg>> = async {
        let channel = handle.channel_open_session().await.map_err(|e| {
            AppError::new(
                ErrorCode::SshChannelOpenFailed,
                format!("Channel open: {}", e),
            )
        })?;

        channel
            .request_pty(true, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("PTY: {}", e)))?;

        channel
            .request_shell(true)
            .await
            .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Shell: {}", e)))?;
        Ok(channel)
    }
    .await;
    restore_session_handle(session_id, handle).await?;
    let channel = channel_result?;

    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
    {
        let mut sessions = SESSIONS.lock().await;
        let session = sessions.get_mut(session_id).ok_or_else(|| {
            AppError::new(
                ErrorCode::SshSessionTimeout,
                "Session removed before PTY startup",
            )
        })?;
        // If a previous shell channel exists, gracefully replace it without
        // emitting a disconnected state for the new terminal.
        if let Some(old_tx) = session.cmd_tx.take() {
            old_tx.send(ShellCmd::Replace).ok();
        }
        session.cmd_tx = Some(cmd_tx);
        session.pty_size = Some((cols, rows));
    }

    let sid = session_id.to_string();
    tokio::spawn(shell_task(channel, sid, cmd_rx, app));

    Ok(())
}

async fn send_shell_input(session_id: &str, data: &[u8]) -> AppResult<()> {
    let sessions = SESSIONS.lock().await;
    let session = sessions
        .get(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
    let tx = match &session.cmd_tx {
        Some(tx) => tx.clone(),
        None => {
            return Err(AppError::new(
                ErrorCode::SshChannelOpenFailed,
                "No shell open",
            ))
        }
    };
    drop(sessions);

    let (reply_tx, reply_rx) = oneshot::channel();
    tx.send(ShellCmd::Data(data.to_vec(), reply_tx))
        .map_err(|_| AppError::new(ErrorCode::SshChannelOpenFailed, "Shell closed"))?;
    match tokio::time::timeout(std::time::Duration::from_secs(5), reply_rx).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err(AppError::new(
            ErrorCode::SshChannelOpenFailed,
            "Shell closed before confirming input",
        )),
        Err(_) => Err(AppError::new(
            ErrorCode::SshChannelOpenFailed,
            "Shell write timed out",
        )),
    }
}

async fn reconnect_shell_session(app: AppHandle, session_id: &str) -> AppResult<()> {
    let (cols, rows) = {
        let sessions = SESSIONS.lock().await;
        let session = sessions
            .get(session_id)
            .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
        session.pty_size.unwrap_or((80, 24))
    };
    emit_status(
        &app,
        session_id,
        "reconnecting",
        "Restoring idle SSH connection",
    );
    reconnect_session(session_id).await?;
    open_shell(app, session_id, cols, rows).await
}

/// Write interactively with an acknowledgement. If an idle network device has
/// dropped the TCP session, recreate both the SSH transport and PTY, then retry
/// the current user input once so the terminal never remains frozen.
pub async fn write_to_shell(app: AppHandle, session_id: &str, data: &[u8]) -> AppResult<()> {
    match send_shell_input(session_id, data).await {
        Ok(()) => Ok(()),
        Err(_) => {
            reconnect_shell_session(app, session_id).await?;
            send_shell_input(session_id, data).await
        }
    }
}

pub async fn resize_shell(session_id: &str, cols: u32, rows: u32) -> AppResult<()> {
    let mut sessions = SESSIONS.lock().await;
    let session = sessions
        .get_mut(session_id)
        .ok_or_else(|| AppError::new(ErrorCode::SshSessionTimeout, "Session not found"))?;
    session.pty_size = Some((cols, rows));
    if let Some(tx) = &session.cmd_tx {
        tx.send(ShellCmd::Resize(cols, rows)).ok();
    }
    Ok(())
}

/// Structured result of a non-interactive command execution.
/// Lets the frontend distinguish "ran fine, no output" from "actually failed",
/// so an empty stdout is never mistaken for a dropped connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    /// Remote process exit code (None if the server never sent one, e.g. on timeout)
    pub exit_code: Option<i32>,
    /// True when we stopped waiting because the command kept running past the timeout
    pub timed_out: bool,
}

/// Open an exec channel and start the command, bounded by a timeout.
/// A half-open (idle-dropped) connection makes `channel_open_session` hang;
/// the timeout turns that hang into a fast, recoverable error so the caller
/// can reconnect instead of leaving the AI waiting on a dead socket.
async fn open_exec_channel(
    handle: &client::Handle<SshHandler>,
    command: &str,
) -> AppResult<russh::Channel<russh::client::Msg>> {
    let open_fut = handle.channel_open_session();
    let channel = match tokio::time::timeout(std::time::Duration::from_secs(12), open_fut).await {
        Ok(Ok(ch)) => ch,
        Ok(Err(e)) => {
            return Err(AppError::new(
                ErrorCode::SshChannelOpenFailed,
                format!("Exec channel: {}", e),
            ))
        }
        Err(_) => {
            return Err(AppError::new(
                ErrorCode::SshChannelOpenFailed,
                "Channel open timed out",
            ))
        }
    };
    channel
        .exec(true, command)
        .await
        .map_err(|e| AppError::new(ErrorCode::SshChannelOpenFailed, format!("Exec: {}", e)))?;
    Ok(channel)
}

/// Temporarily take the session handle so command execution can await without
/// keeping the global session map locked. The handle is put back before the
/// opened channel is drained.
async fn open_exec_channel_for_session(
    session_id: &str,
    command: &str,
) -> AppResult<russh::Channel<russh::client::Msg>> {
    let handle = take_session_handle(session_id).await?;

    let result = open_exec_channel(&handle, command).await;
    restore_session_handle(session_id, handle).await?;

    result
}

/// Drain a running exec channel into a structured result.
async fn read_exec_output(
    mut channel: russh::Channel<russh::client::Msg>,
) -> AppResult<ExecResult> {
    let mut stdout = String::new();
    let mut stderr = String::new();
    let mut exit_code: Option<i32> = None;
    let mut timed_out = false;

    // The command may take a moment to produce its first byte; once data flows,
    // gaps between messages should be short. A hung command (e.g. tail -f) trips
    // the idle timeout and returns whatever was produced so far, flagged as timed_out.
    let first_wait = std::time::Duration::from_secs(30);
    let idle_wait = std::time::Duration::from_secs(20);
    let mut wait_for = first_wait;

    loop {
        match tokio::time::timeout(wait_for, channel.wait()).await {
            Ok(Some(ChannelMsg::Data { ref data })) => {
                stdout.push_str(&String::from_utf8_lossy(data));
                wait_for = idle_wait;
            }
            Ok(Some(ChannelMsg::ExtendedData { ref data, .. })) => {
                stderr.push_str(&String::from_utf8_lossy(data));
                wait_for = idle_wait;
            }
            // exit-status arrives before EOF per the SSH spec — record it, keep reading
            Ok(Some(ChannelMsg::ExitStatus { exit_status })) => {
                exit_code = Some(exit_status as i32);
            }
            Ok(Some(ChannelMsg::Eof)) | Ok(Some(ChannelMsg::Close)) | Ok(None) => break,
            Ok(_) => {}
            Err(_) => {
                timed_out = true;
                break;
            }
        }
    }
    channel.close().await.ok();

    Ok(ExecResult {
        stdout,
        stderr,
        exit_code,
        timed_out,
    })
}

/// Execute single command via exec channel — returns structured result.
/// Self-healing: if opening the channel fails or times out (the connection was
/// idle-dropped), transparently reconnect using the stored config and retry once.
/// The frontend/AI never sees the reconnect — it just gets the command output.
pub async fn exec_command_full(session_id: &str, command: &str) -> AppResult<ExecResult> {
    let channel = match open_exec_channel_for_session(session_id, command).await {
        Ok(ch) => ch,
        Err(_) => {
            // Connection is likely dead — reconnect and retry once.
            reconnect_session(session_id).await?;
            open_exec_channel_for_session(session_id, command).await?
        }
    };

    read_exec_output(channel).await
}

/// Backward-compatible string variant (command palette + quick diagnostics).
/// Concatenates stdout and stderr, same shape as the original API.
pub async fn exec_command(session_id: &str, command: &str) -> AppResult<String> {
    let r = exec_command_full(session_id, command).await?;
    let mut out = r.stdout;
    if !r.stderr.is_empty() {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        out.push_str(&r.stderr);
    }
    Ok(out)
}

pub async fn disconnect(session_id: &str) -> AppResult<()> {
    let mut sessions = SESSIONS.lock().await;
    if let Some(s) = sessions.get(session_id) {
        if let Some(tx) = &s.cmd_tx {
            tx.send(ShellCmd::Close).ok();
        }
    }
    sessions.remove(session_id);
    Ok(())
}
