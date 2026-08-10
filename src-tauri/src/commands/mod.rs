//! Tauri 全局指令注册模块
//! 所有前端可调用的后端方法在此注册
//! 指令命名对齐规范：save_token / load_token / ai_chat / ai_chat_stream
//! SSH增强：ssh_test_connect / sftp_read_dir / sftp_mkdir / sftp_remove / sftp_rename / sftp_upload / sftp_download

use crate::ai;
use crate::error::{AppError, AppResult, ErrorCode};
use crate::network;
use crate::protocol::sftp::{self, DirectoryListing, FileEntry, TransferProgress};
use crate::protocol::ssh::{self, SshConnectConfig, SshSessionInfo, SshTestResult};
use crate::storage::{self, AppConfig};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};

// ============================================================
// Token 相关指令
// ============================================================

/// 保存 AI Token（加密存储到本地）
#[tauri::command]
pub fn save_token(app: AppHandle, token: String) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    storage::save_token(&data_dir, &token)
}

/// 读取 AI Token（解密后返回明文）
#[tauri::command]
pub fn load_token(app: AppHandle) -> AppResult<String> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    storage::load_token(&data_dir)
}

/// 删除 AI Token
#[tauri::command]
pub fn delete_token(app: AppHandle) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    storage::delete_token(&data_dir)
}

/// 检查 Token 是否已配置
#[tauri::command]
pub fn has_token(app: AppHandle) -> AppResult<bool> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    Ok(storage::has_token(&data_dir))
}

// ============================================================
// 配置相关指令
// ============================================================

/// 保存应用配置
#[tauri::command]
pub fn save_config(app: AppHandle, config: AppConfig) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    storage::write_config(&data_dir, &config)
}

/// 读取应用配置
#[tauri::command]
pub fn load_config(app: AppHandle) -> AppResult<AppConfig> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(
            crate::error::ErrorCode::IoError,
            "获取app_data_dir失败",
            e.to_string(),
        )
    })?;
    storage::read_config(&data_dir)
}

// ============================================================
// SSH 预检连接指令
// ============================================================

/// SSH 预检连接（仅握手鉴权，不创建持久会话）
/// 精准区分4类错误：端口不通 / 账号密码错误 / 密钥无效 / 防火墙拦截
/// Resolve encrypted private-key material immediately before use.  The key is
/// then held only by the live SSH session for reconnect support.
fn hydrate_private_key(app: &AppHandle, config: &mut SshConnectConfig) -> AppResult<()> {
    if let ssh::SshAuthMethod::PrivateKey {
        key_content,
        key_ref,
        ..
    } = &mut config.auth
    {
        let missing_content = key_content
            .as_deref()
            .map(str::trim)
            .unwrap_or("")
            .is_empty();
        if missing_content {
            if let Some(key_ref) = key_ref.as_deref() {
                let data_dir = app.path().app_data_dir().map_err(|e| {
                    AppError::with_source(ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
                })?;
                *key_content = Some(storage::load_ssh_private_key(&data_dir, key_ref)?);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_ssh_private_key(app: AppHandle, key_ref: String, private_key: String) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::save_ssh_private_key(&data_dir, &key_ref, &private_key)
}

#[tauri::command]
pub fn delete_ssh_private_key(app: AppHandle, key_ref: String) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::delete_ssh_private_key(&data_dir, &key_ref)
}

#[tauri::command]
pub async fn ssh_test_connect(
    app: AppHandle,
    mut config: SshConnectConfig,
) -> AppResult<SshTestResult> {
    hydrate_private_key(&app, &mut config)?;
    ssh::ssh_test_connect(&config).await
}

#[tauri::command]
pub async fn ssh_connect(
    app: AppHandle,
    mut config: SshConnectConfig,
) -> AppResult<SshSessionInfo> {
    hydrate_private_key(&app, &mut config)?;
    ssh::connect(config).await
}

#[tauri::command]
pub async fn ssh_disconnect(session_id: String) -> AppResult<()> {
    ssh::disconnect(&session_id).await
}

#[tauri::command]
pub async fn ssh_exec(session_id: String, command: String) -> AppResult<String> {
    ssh::exec_command(&session_id, &command).await
}

/// 执行单条命令并返回结构化结果（stdout / stderr / 退出码 / 是否超时）
/// 供 AI 智能体使用：空输出可明确区分"成功无输出"与"执行失败"
#[tauri::command]
pub async fn ssh_exec_full(session_id: String, command: String) -> AppResult<ssh::ExecResult> {
    ssh::exec_command_full(&session_id, &command).await
}

/// 打开交互式Shell（PTY分配 + shell启动）
#[tauri::command]
pub async fn ssh_open_shell(
    app: AppHandle,
    session_id: String,
    cols: u32,
    rows: u32,
) -> AppResult<()> {
    ssh::open_shell(app, &session_id, cols, rows).await
}

/// 向Shell写入数据（用户键盘输入）
#[tauri::command]
pub async fn ssh_write(app: AppHandle, session_id: String, data: Vec<u8>) -> AppResult<()> {
    ssh::write_to_shell(app, &session_id, &data).await
}

/// 调整PTY终端尺寸
#[tauri::command]
pub async fn ssh_resize(session_id: String, cols: u32, rows: u32) -> AppResult<()> {
    ssh::resize_shell(&session_id, cols, rows).await
}

// ============================================================
// SFTP 文件操作指令
// ============================================================

/// 读取远端目录列表
#[tauri::command]
pub async fn sftp_read_dir(session_id: String, path: String) -> AppResult<DirectoryListing> {
    sftp::read_dir(&session_id, &path).await
}

/// 新建远端目录
#[tauri::command]
pub async fn sftp_mkdir(session_id: String, path: String) -> AppResult<()> {
    sftp::create_dir(&session_id, &path).await
}

/// 删除远端文件/目录
#[tauri::command]
pub async fn sftp_remove(session_id: String, path: String, recursive: bool) -> AppResult<()> {
    sftp::remove(&session_id, &path, recursive).await
}

/// 重命名远端文件/目录
#[tauri::command]
pub async fn sftp_rename(session_id: String, old_path: String, new_path: String) -> AppResult<()> {
    sftp::rename(&session_id, &old_path, &new_path).await
}

/// 上传本地文件到远端（支持拖拽传入本地路径）
#[tauri::command]
pub async fn sftp_upload(
    session_id: String,
    local_path: String,
    remote_path: String,
) -> AppResult<TransferProgress> {
    // 验证本地文件存在
    if !std::path::Path::new(&local_path).exists() {
        return Err(AppError::new(
            crate::error::ErrorCode::SftpUploadFailed,
            format!("本地文件不存在: {}", local_path),
        ));
    }
    sftp::upload_file(&session_id, &local_path, &remote_path).await
}

/// 下载远端文件到本地
#[tauri::command]
pub async fn sftp_download(
    session_id: String,
    remote_path: String,
    local_path: String,
) -> AppResult<TransferProgress> {
    // 确保本地目标目录存在
    if let Some(parent) = std::path::Path::new(&local_path).parent() {
        std::fs::create_dir_all(parent).ok();
    }
    sftp::download_file(&session_id, &remote_path, &local_path).await
}

/// 获取文件属性
#[tauri::command]
pub async fn sftp_stat(session_id: String, path: String) -> AppResult<FileEntry> {
    sftp::stat(&session_id, &path).await
}

// ============================================================
// AI 对话相关指令
// ============================================================

/// AI 对话请求参数
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatRequest {
    pub agent_id: String,
    pub message: String,
    #[serde(default)]
    pub history: Vec<AiChatMessage>,
    /// API 配置 —— 前端直接传入，绕过 Rust 本地加密存储
    #[serde(default)]
    pub api_base: String,
    #[serde(default)]
    pub api_token: String,
    #[serde(default)]
    pub api_model: String,
    #[serde(default = "default_api_timeout")]
    pub api_timeout_ms: u64,
}

fn default_api_timeout() -> u64 {
    30000
}

/// AI 对话消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatMessage {
    pub role: String,
    pub content: String,
}

/// AI 对话响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiChatResponse {
    pub agent_id: String,
    pub reply: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Look up an agent by ID from the built-in agent definitions
fn get_agent_by_id(agent_id: &str) -> Option<crate::ai::Agent> {
    ai::default_agents().into_iter().find(|a| a.id == agent_id)
}

/// AI 对话（普通模式）— 前端传入 API 配置，Rust 代理请求绕过 CORS
#[tauri::command]
pub async fn ai_chat(app: AppHandle, request: AiChatRequest) -> AppResult<AiChatResponse> {
    // 1) Resolve API config: prefer request fields, fall back to encrypted storage
    let (api_base, api_key, model, timeout_ms) = resolve_api_config(&app, &request).await?;

    if api_key.is_empty() {
        return Ok(AiChatResponse {
            agent_id: request.agent_id.clone(),
            reply: String::new(),
            success: false,
            error: Some(
                "No API token configured. Please configure an AI model in AI Models page."
                    .to_string(),
            ),
        });
    }

    // 2) Get agent system prompt
    let agent = get_agent_by_id(&request.agent_id);

    // 3) Build messages array: [system, ...history, user]
    let mut messages: Vec<serde_json::Value> = Vec::new();

    if let Some(ref agent) = agent {
        messages.push(serde_json::json!({
            "role": "system",
            "content": agent.system_prompt,
        }));
    }

    for msg in &request.history {
        messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": request.message,
    }));

    // 4) Build HTTP request
    let url = format!("{}/chat/completions", api_base.trim_end_matches('/'));
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": false,
    });

    let mut headers = std::collections::HashMap::new();
    headers.insert("Authorization".to_string(), format!("Bearer {}", api_key));
    headers.insert("Content-Type".to_string(), "application/json".to_string());

    let http_config = network::HttpRequestConfig {
        url,
        method: network::HttpMethod::Post,
        headers,
        body: Some(body.to_string()),
        timeout_ms,
    };

    // 5) Send request via real HTTP client (reqwest, no CORS)
    let response = network::send_request(http_config).await?;

    // 6) Parse response
    let status_is_ok = response.status >= 200 && response.status < 300;
    if !status_is_ok {
        return Ok(AiChatResponse {
            agent_id: request.agent_id.clone(),
            reply: String::new(),
            success: false,
            error: Some(format!(
                "API returned status {}: {}",
                response.status, response.body
            )),
        });
    }

    let parsed: serde_json::Value = serde_json::from_str(&response.body).map_err(|e| {
        AppError::with_source(
            ErrorCode::AiRequestFailed,
            "Failed to parse AI response",
            e.to_string(),
        )
    })?;

    let reply = parsed["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .to_string();

    Ok(AiChatResponse {
        agent_id: request.agent_id.clone(),
        reply,
        success: true,
        error: None,
    })
}

/// Resolve API config: request fields take priority, falling back to Rust encrypted storage
async fn resolve_api_config(
    app: &AppHandle,
    request: &AiChatRequest,
) -> AppResult<(String, String, String, u64)> {
    if !request.api_token.is_empty() && !request.api_base.is_empty() {
        return Ok((
            request.api_base.clone(),
            request.api_token.clone(),
            if request.api_model.is_empty() {
                "gpt-4o-mini".to_string()
            } else {
                request.api_model.clone()
            },
            if request.api_timeout_ms == 0 {
                30000
            } else {
                request.api_timeout_ms
            },
        ));
    }
    // Fallback: load from Rust encrypted storage
    let proxy = network::load_ai_proxy_config(app).await?;
    Ok((proxy.api_base, proxy.api_key, proxy.model, proxy.timeout_ms))
}

/// AI 流式对话（SSE模式，前端传入 API 配置，Rust 代理请求绕过 CORS）
#[tauri::command]
pub async fn ai_chat_stream(app: AppHandle, request: AiChatRequest) -> AppResult<()> {
    let agent_id = request.agent_id.clone();

    // 1) Resolve API config: prefer request fields, fall back to encrypted storage
    let (api_base, api_key, model, timeout_ms) = match resolve_api_config(&app, &request).await {
        Ok(cfg) => cfg,
        Err(e) => {
            let _ = app.emit(
                "ai-stream-error",
                serde_json::json!({
                    "agent_id": &agent_id,
                    "error": format!("Failed to load config: {}", e),
                }),
            );
            return Err(e);
        }
    };

    if api_key.is_empty() {
        let _ = app.emit(
            "ai-stream-error",
            serde_json::json!({
                "agent_id": &agent_id,
                "error": "No API token configured. Please configure an AI model in AI Models page.",
            }),
        );
        return Err(AppError::new(
            ErrorCode::AiTokenInvalid,
            "No API token configured",
        ));
    }

    // 2) Get agent system prompt
    let agent = get_agent_by_id(&request.agent_id);

    // 3) Build messages array
    let mut messages: Vec<serde_json::Value> = Vec::new();

    if let Some(ref agent) = agent {
        messages.push(serde_json::json!({
            "role": "system",
            "content": agent.system_prompt,
        }));
    }

    for msg in &request.history {
        messages.push(serde_json::json!({
            "role": msg.role,
            "content": msg.content,
        }));
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": request.message,
    }));

    let messages_json = serde_json::to_string(&messages).unwrap_or_else(|_| "[]".to_string());

    // 4) Build proxy config struct for the network layer
    let proxy_config = network::AiProxyConfig {
        api_base,
        api_key,
        model,
        timeout_ms: if timeout_ms == 0 { 60000 } else { timeout_ms },
        ..Default::default()
    };

    // 5) Start real SSE streaming via reqwest — events emitted inside ai_stream_request
    match network::ai_stream_request(app.clone(), &proxy_config, &agent_id, &messages_json).await {
        Ok(full_response) => {
            if full_response.is_empty() {
                let _ = app.emit(
                    "ai-stream-done",
                    serde_json::json!({
                        "agent_id": agent_id,
                        "full_response": "",
                    }),
                );
            }
            Ok(())
        }
        Err(e) => {
            let _ = app.emit(
                "ai-stream-error",
                serde_json::json!({
                    "agent_id": agent_id,
                    "error": e.to_string(),
                }),
            );
            Err(e)
        }
    }
}

/// AI 连通性测试请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTestRequest {
    pub api_base: String,
    pub api_token: String,
    pub timeout_ms: u64,
}

/// AI 连通性测试响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiTestResponse {
    pub success: bool,
    pub message: String,
    pub status_code: u16,
}

/// AI API 连通性测试 — POST /chat/completions with max_tokens=1，绕过 CORS
#[tauri::command]
pub async fn test_ai_connection(request: AiTestRequest) -> AppResult<AiTestResponse> {
    let url = format!(
        "{}/chat/completions",
        request.api_base.trim_end_matches('/')
    );

    // 发送一条最小对话测试连通性和鉴权
    let body = serde_json::json!({
        "model": "deepseek-chat",  // 通用模型 ID，兼容所有 DeepSeek 版本
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 1,
        "stream": false,
    });

    let mut headers = std::collections::HashMap::new();
    headers.insert(
        "Authorization".to_string(),
        format!("Bearer {}", request.api_token),
    );
    headers.insert("Content-Type".to_string(), "application/json".to_string());

    let http_config = network::HttpRequestConfig {
        url,
        method: network::HttpMethod::Post,
        headers,
        body: Some(body.to_string()),
        timeout_ms: if request.timeout_ms == 0 {
            15000
        } else {
            request.timeout_ms
        },
    };

    match network::send_request(http_config).await {
        Ok(resp) => {
            let success = resp.status >= 200 && resp.status < 300;
            Ok(AiTestResponse {
                success,
                message: if success {
                    "Connection successful".to_string()
                } else {
                    format!(
                        "API returned status {}: {}",
                        resp.status,
                        if resp.body.len() > 300 {
                            format!("{}...", &resp.body[..300])
                        } else {
                            resp.body.clone()
                        }
                    )
                },
                status_code: resp.status,
            })
        }
        Err(e) => Ok(AiTestResponse {
            success: false,
            message: e.to_string(),
            status_code: 0,
        }),
    }
}

// ============================================================
// 系统信息指令
// ============================================================

// ============================================================
// SFTP 扩展指令（chmod / touch / compress）
// ============================================================

/// 修改文件/目录权限
#[tauri::command]
pub async fn sftp_chmod(session_id: String, path: String, mode: String) -> AppResult<()> {
    sftp::chmod(&session_id, &path, &mode).await
}

/// 新建空文件（touch）
#[tauri::command]
pub async fn sftp_touch(session_id: String, path: String) -> AppResult<()> {
    sftp::touch(&session_id, &path).await
}

/// 压缩/解压文件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressRequest {
    pub session_id: String,
    pub source_path: String,
    pub target_path: String,
    pub decompress: bool,
}

#[tauri::command]
pub async fn sftp_compress(request: CompressRequest) -> AppResult<()> {
    sftp::compress(
        &request.session_id,
        &request.source_path,
        &request.target_path,
        request.decompress,
    )
    .await
}

// ============================================================
// 系统信息指令
// ============================================================

/// 获取系统基本信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub rust_version: String,
    pub app_version: String,
}

#[tauri::command]
pub fn get_system_info() -> AppResult<SystemInfo> {
    Ok(SystemInfo {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        rust_version: "1.80+".to_string(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
    })
}
