//! 应用配置模块
//! 管理应用运行时配置、环境变量、默认值

use serde::{Deserialize, Serialize};

/// 应用运行时配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    /// 应用名称
    pub app_name: String,
    /// 应用版本
    pub app_version: String,
    /// 是否为开发模式
    pub dev_mode: bool,
    /// 日志级别
    pub log_level: String,
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            app_name: "AITerminal".to_string(),
            app_version: env!("CARGO_PKG_VERSION").to_string(),
            dev_mode: cfg!(debug_assertions),
            log_level: if cfg!(debug_assertions) {
                "debug"
            } else {
                "info"
            }
            .to_string(),
        }
    }
}

/// 获取运行时配置
pub fn get_runtime_config() -> RuntimeConfig {
    RuntimeConfig::default()
}
