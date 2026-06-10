//! Tauri 全局指令注册模块
//! 所有前端可调用的后端方法在此注册
//! 指令命名对齐规范：save_token / load_token / ai_chat / ai_chat_stream
//! SSH增强：ssh_test_connect / sftp_read_dir / sftp_mkdir / sftp_remove / sftp_rename / sftp_upload / sftp_download

use crate::error::{AppError, AppResult};
use crate::storage::{self, AppConfig};
use crate::protocol::ssh::{self, SshConnectConfig, SshSessionInfo, SshTestResult};
use crate::protocol::sftp::{self, DirectoryListing, FileEntry, TransferProgress};
use tauri::{AppHandle, Emitter, Manager};
use serde::{Deserialize, Serialize};

// ============================================================
// Token 相关指令
// ============================================================

/// 保存 AI Token（加密存储到本地）
#[tauri::command]
pub fn save_token(app: AppHandle, token: String) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::save_token(&data_dir, &token)
}

/// 读取 AI Token（解密后返回明文）
#[tauri::command]
pub fn load_token(app: AppHandle) -> AppResult<String> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::load_token(&data_dir)
}

/// 删除 AI Token
#[tauri::command]
pub fn delete_token(app: AppHandle) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::delete_token(&data_dir)
}

/// 检查 Token 是否已配置
#[tauri::command]
pub fn has_token(app: AppHandle) -> AppResult<bool> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
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
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::write_config(&data_dir, &config)
}

/// 读取应用配置
#[tauri::command]
pub fn load_config(app: AppHandle) -> AppResult<AppConfig> {
    let data_dir = app.path().app_data_dir().map_err(|e| {
        AppError::with_source(crate::error::ErrorCode::IoError, "获取app_data_dir失败", e.to_string())
    })?;
    storage::read_config(&data_dir)
}

// ============================================================
// SSH 预检连接指令
// ============================================================

/// SSH 预检连接（仅握手鉴权，不创建持久会话）
/// 精准区分4类错误：端口不通 / 账号密码错误 / 密钥无效 / 防火墙拦截
#[tauri::command]
pub async fn ssh_test_connect(config: SshConnectConfig) -> AppResult<SshTestResult> {
    ssh::ssh_test_connect(&config).await
}

#[tauri::command]
pub async fn ssh_connect(config: SshConnectConfig) -> AppResult<SshSessionInfo> {
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

/// 打开交互式Shell（PTY分配 + shell启动）
#[tauri::command]
pub async fn ssh_open_shell(app: AppHandle, session_id: String, cols: u32, rows: u32) -> AppResult<()> {
    ssh::open_shell(app, &session_id, cols, rows).await
}

/// 向Shell写入数据（用户键盘输入）
#[tauri::command]
pub async fn ssh_write(session_id: String, data: Vec<u8>) -> AppResult<()> {
    ssh::write_to_shell(&session_id, &data).await
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
pub async fn sftp_upload(session_id: String, local_path: String, remote_path: String) -> AppResult<TransferProgress> {
    // 验证本地文件存在
    if !std::path::Path::new(&local_path).exists() {
        return Err(AppError::new(crate::error::ErrorCode::SftpUploadFailed, format!("本地文件不存在: {}", local_path)));
    }
    sftp::upload_file(&session_id, &local_path, &remote_path).await
}

/// 下载远端文件到本地
#[tauri::command]
pub async fn sftp_download(session_id: String, remote_path: String, local_path: String) -> AppResult<TransferProgress> {
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

/// AI 对话（普通模式）
#[tauri::command]
pub async fn ai_chat(request: AiChatRequest) -> AppResult<AiChatResponse> {
    Ok(AiChatResponse {
        agent_id: request.agent_id.clone(),
        reply: format!("[Demo模式] 智能体 {} 收到消息: {}", request.agent_id, request.message),
        success: true,
        error: None,
    })
}

/// AI 流式对话（SSE模式，通过 Tauri Event 推送 chunk）
#[tauri::command]
pub async fn ai_chat_stream(app: AppHandle, request: AiChatRequest) -> AppResult<()> {
    let demo_reply = format!("[Demo流式] 智能体 {} 收到消息: {}", request.agent_id, request.message);
    for (i, ch) in demo_reply.chars().enumerate() {
        let _ = app.emit("ai-stream-chunk", serde_json::json!({
            "agent_id": request.agent_id,
            "chunk": ch.to_string(),
            "index": i,
        }));
        tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    }
    let _ = app.emit("ai-stream-done", serde_json::json!({
        "agent_id": request.agent_id,
        "full_response": demo_reply,
    }));
    Ok(())
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
    sftp::compress(&request.session_id, &request.source_path, &request.target_path, request.decompress).await
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
