//! 本地文件存储模块
//! 实现软件配置持久化、AI Token 加密存储与读取
//! 拓展字段：SSH服务器列表、连接备注、自定义超时、快捷命令收藏

use crate::crypto;
use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// 应用配置数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// AI Token（加密存储）
    #[serde(default)]
    pub ai_token_encrypted: Option<String>,
    /// AI API Base URL
    #[serde(default = "default_api_base")]
    pub ai_api_base: String,
    /// AI 模型名称
    #[serde(default = "default_model")]
    pub ai_model: String,
    /// 当前选中的智能体ID
    #[serde(default)]
    pub active_agent_id: Option<String>,
    /// 窗口宽度
    #[serde(default = "default_width")]
    pub window_width: f64,
    /// 窗口高度
    #[serde(default = "default_height")]
    pub window_height: f64,
    /// SSH 服务器列表（拓展字段）
    #[serde(default)]
    pub ssh_servers: Vec<SshServerConfig>,
    /// 快捷命令收藏（拓展字段）
    #[serde(default)]
    pub quick_commands: Vec<QuickCommand>,
}

/// SSH 服务器配置（持久化存储）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshServerConfig {
    /// 唯一ID
    pub id: String,
    /// 服务器名称
    pub name: String,
    /// 主机地址
    pub host: String,
    /// 端口
    pub port: u16,
    /// 用户名
    pub username: String,
    /// 认证方式
    pub auth_type: String,
    /// 密码（加密存储）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password_encrypted: Option<String>,
    /// 私钥路径
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key_path: Option<String>,
    /// 连接备注标签
    #[serde(default)]
    pub remark: String,
    /// 是否置顶
    #[serde(default)]
    pub pinned: bool,
    /// 自定义连接超时（毫秒，0=使用默认）
    #[serde(default)]
    pub custom_timeout_ms: u64,
    /// 分组标签
    #[serde(default)]
    pub group: String,
    /// 最后连接时间
    #[serde(default)]
    pub last_connected_at: u64,
}

/// 快捷命令收藏
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QuickCommand {
    /// 唯一ID
    pub id: String,
    /// 命令名称
    pub name: String,
    /// 命令内容
    pub command: String,
    /// 描述
    #[serde(default)]
    pub description: String,
}

fn default_api_base() -> String {
    "https://api.openai.com/v1".to_string()
}
fn default_model() -> String {
    "gpt-4o".to_string()
}
fn default_width() -> f64 {
    1200.0
}
fn default_height() -> f64 {
    800.0
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            ai_token_encrypted: None,
            ai_api_base: default_api_base(),
            ai_model: default_model(),
            active_agent_id: None,
            window_width: default_width(),
            window_height: default_height(),
            ssh_servers: Vec::new(),
            quick_commands: Vec::new(),
        }
    }
}

/// 获取配置文件路径
fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("config.json")
}

/// 获取 Token 存储路径
fn token_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("token.enc")
}

/// 读取应用配置
pub fn read_config(app_data_dir: &Path) -> AppResult<AppConfig> {
    let path = config_path(app_data_dir);
    if !path.exists() {
        return Ok(AppConfig::default());
    }
    let content = fs::read_to_string(&path)?;
    let config: AppConfig = serde_json::from_str(&content)?;
    Ok(config)
}

/// 写入应用配置
pub fn write_config(app_data_dir: &Path, config: &AppConfig) -> AppResult<()> {
    fs::create_dir_all(app_data_dir)?;
    let path = config_path(app_data_dir);
    let content = serde_json::to_string_pretty(config)?;
    fs::write(&path, content)?;
    Ok(())
}

/// 保存 AI Token（加密后存储）
pub fn save_token(app_data_dir: &Path, token: &str) -> AppResult<()> {
    fs::create_dir_all(app_data_dir)?;
    let encrypted = crypto::encrypt_token(token)?;
    let path = token_path(app_data_dir);
    fs::write(&path, &encrypted)?;
    Ok(())
}

/// 读取 AI Token（解密后返回）
pub fn load_token(app_data_dir: &Path) -> AppResult<String> {
    let path = token_path(app_data_dir);
    if !path.exists() {
        return Err(AppError::new(ErrorCode::ConfigNotFound, "Token文件不存在"));
    }
    let encrypted = fs::read_to_string(&path)?;
    let token = crypto::decrypt_token(&encrypted)?;
    Ok(token)
}

/// 删除 AI Token
pub fn delete_token(app_data_dir: &Path) -> AppResult<()> {
    let path = token_path(app_data_dir);
    if path.exists() {
        fs::remove_file(&path)?;
    }
    Ok(())
}

/// 检查 Token 是否已配置
pub fn has_token(app_data_dir: &Path) -> bool {
    token_path(app_data_dir).exists()
}

/// 通用文件写入工具
pub fn write_file(path: &Path, content: &str) -> AppResult<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, content)?;
    Ok(())
}

/// 通用文件读取工具
pub fn read_file(path: &Path) -> AppResult<String> {
    if !path.exists() {
        return Err(AppError::new(ErrorCode::ConfigNotFound, format!("文件不存在: {}", path.display())));
    }
    fs::read_to_string(path).map_err(|e| AppError::with_source(ErrorCode::ReadFailed, "文件读取失败", e.to_string()))
}

/// 生成唯一ID
pub fn generate_id() -> String {
    format!("{:x}", std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_config_default() {
        let config = AppConfig::default();
        assert!(config.ai_token_encrypted.is_none());
        assert_eq!(config.ai_model, "gpt-4o");
        assert!(config.ssh_servers.is_empty());
        assert!(config.quick_commands.is_empty());
    }

    #[test]
    fn test_config_roundtrip() {
        let dir = env::temp_dir().join("tauri-ai-test-config");
        let _ = fs::remove_dir_all(&dir);
        let config = AppConfig::default();
        write_config(&dir, &config).unwrap();
        let loaded = read_config(&dir).unwrap();
        assert_eq!(loaded.ai_model, config.ai_model);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_token_save_load() {
        let dir = env::temp_dir().join("tauri-ai-test-token");
        let _ = fs::remove_dir_all(&dir);
        let token = "sk-test-abc123";
        save_token(&dir, token).unwrap();
        let loaded = load_token(&dir).unwrap();
        assert_eq!(token, loaded);
        assert!(has_token(&dir));
        delete_token(&dir).unwrap();
        assert!(!has_token(&dir));
        let _ = fs::remove_dir_all(&dir);
    }
}
