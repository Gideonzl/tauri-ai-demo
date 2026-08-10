//! RDP (3389) 协议模块（预留扩展接口）
//! Demo 版仅定义接口和数据结构，不实现连接逻辑
//! 后续基于 FreeRDP / ironrdp 实现完整 RDP 协议封装

use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};

/// RDP 连接配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdpConnectConfig {
    /// 主机地址
    pub host: String,
    /// 端口（默认3389）
    #[serde(default = "default_rdp_port")]
    pub port: u16,
    /// 用户名
    pub username: String,
    /// 密码
    pub password: String,
    /// 域名（可选）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub domain: Option<String>,
    /// 分辨率
    #[serde(default)]
    pub resolution: RdpResolution,
    /// 连接超时（毫秒）
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_rdp_port() -> u16 {
    3389
}
fn default_timeout() -> u64 {
    15000
}

/// RDP 分辨率配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdpResolution {
    pub width: u32,
    pub height: u32,
}

impl Default for RdpResolution {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
        }
    }
}

/// RDP 会话状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RdpSessionState {
    Disconnected,
    Connecting,
    Authenticating,
    Connected,
    Failed,
    Closed,
}

/// RDP 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RdpSessionInfo {
    /// 会话ID
    pub session_id: String,
    /// 连接配置
    pub config: RdpConnectConfig,
    /// 当前状态
    pub state: RdpSessionState,
}

/// 键鼠事件（预留）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum InputEvent {
    /// 鼠标移动
    MouseMove { x: i32, y: i32 },
    /// 鼠标点击
    MouseClick {
        x: i32,
        y: i32,
        button: u8,
        down: bool,
    },
    /// 键盘按键
    KeyPress { keycode: u32, down: bool },
    /// 滚轮
    MouseWheel { delta: i32 },
}

// ============================================================
// 预留接口（Demo版不实现）
// ============================================================

/// 建立 RDP 连接
pub async fn connect(_config: RdpConnectConfig) -> AppResult<RdpSessionInfo> {
    Err(AppError::new(
        ErrorCode::RdpConnectFailed,
        "RDP连接功能尚未实现，请等待后续版本".to_string(),
    ))
}

/// 断开 RDP 连接
pub async fn disconnect(_session_id: &str) -> AppResult<()> {
    Err(AppError::new(
        ErrorCode::RdpConnectFailed,
        "RDP断连功能尚未实现",
    ))
}

/// 发送键鼠输入事件
pub async fn send_input(_session_id: &str, _event: InputEvent) -> AppResult<()> {
    Err(AppError::new(
        ErrorCode::RdpConnectFailed,
        "RDP输入转发功能尚未实现",
    ))
}

/// 获取桌面画面帧（预留）
pub async fn get_frame(_session_id: &str) -> AppResult<Vec<u8>> {
    Err(AppError::new(
        ErrorCode::RdpDecodeFailed,
        "RDP画面获取功能尚未实现",
    ))
}
