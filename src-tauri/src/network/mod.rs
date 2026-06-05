//! 网络请求模块
//! 预留 AI 请求代理、HTTP 客户端、连接状态监听
//! Demo 版仅搭建基础结构，不实现完整网络逻辑

use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};

/// HTTP 请求方法
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "UPPERCASE")]
pub enum HttpMethod {
    Get,
    Post,
    Put,
    Delete,
}

/// HTTP 请求配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpRequestConfig {
    /// 请求URL
    pub url: String,
    /// 请求方法
    pub method: HttpMethod,
    /// 请求头
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    /// 请求体（POST/PUT）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    /// 超时时间（毫秒）
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_timeout() -> u64 {
    30000
}

/// HTTP 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    /// 状态码
    pub status: u16,
    /// 响应头
    pub headers: std::collections::HashMap<String, String>,
    /// 响应体
    pub body: String,
    /// 耗时（毫秒）
    pub elapsed_ms: u64,
}

/// 网络连接状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectionStatus {
    /// 未连接
    Disconnected,
    /// 连接中
    Connecting,
    /// 已连接
    Connected,
    /// 重连中
    Reconnecting,
    /// 连接失败
    Failed,
    /// 已断开
    Closed,
}

/// AI 请求代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProxyConfig {
    /// API Base URL
    pub api_base: String,
    /// API Key（运行时从加密存储读取）
    #[serde(skip)]
    pub api_key: String,
    /// 模型名称
    pub model: String,
    /// 请求超时（毫秒）
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    /// 是否启用代理
    #[serde(default)]
    pub proxy_enabled: bool,
    /// 代理地址
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proxy_url: Option<String>,
}

impl Default for AiProxyConfig {
    fn default() -> Self {
        Self {
            api_base: "https://api.openai.com/v1".to_string(),
            api_key: String::new(),
            model: "gpt-4o".to_string(),
            timeout_ms: 60000,
            proxy_enabled: false,
            proxy_url: None,
        }
    }
}

/// 发送 HTTP 请求（预留，Demo版不实现）
pub async fn send_request(_config: HttpRequestConfig) -> AppResult<HttpResponse> {
    // TODO: 使用 reqwest 实现 HTTP 请求
    // Demo版预留接口，后续接入真实 HTTP 客户端
    Err(AppError::new(
        ErrorCode::AiRequestFailed,
        "HTTP请求功能尚未实现，请等待后续版本".to_string(),
    ))
}

/// AI SSE 流式请求（预留，Demo版不实现）
pub async fn ai_stream_request(
    _proxy_config: &AiProxyConfig,
    _prompt: &str,
) -> AppResult<()> {
    // TODO: 使用 reqwest + event-stream 实现 SSE 流式对话
    // Demo版预留接口，后续由 AI 集成工程师接入
    Err(AppError::new(
        ErrorCode::AiStreamInterrupted,
        "SSE流式对话功能尚未实现，请等待后续版本".to_string(),
    ))
}

/// 检查网络连通性
pub async fn check_connectivity(_url: &str) -> AppResult<bool> {
    // TODO: 实现网络连通性检测
    Ok(true)
}
