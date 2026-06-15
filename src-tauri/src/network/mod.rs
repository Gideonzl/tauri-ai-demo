//! 网络请求模块
//! AI 请求代理、HTTP 客户端、SSE 流式对话、连接状态监听

use crate::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};
use tauri::Emitter;

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
    pub url: String,
    pub method: HttpMethod,
    #[serde(default)]
    pub headers: std::collections::HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
}

fn default_timeout() -> u64 { 30000 }

/// HTTP 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HttpResponse {
    pub status: u16,
    pub headers: std::collections::HashMap<String, String>,
    pub body: String,
    pub elapsed_ms: u64,
}

/// 网络连接状态
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ConnectionStatus {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
    Failed,
    Closed,
}

/// AI 请求代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiProxyConfig {
    pub api_base: String,
    #[serde(skip)]
    pub api_key: String,
    pub model: String,
    #[serde(default = "default_timeout")]
    pub timeout_ms: u64,
    #[serde(default)]
    pub proxy_enabled: bool,
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

// ============================================================
// Real HTTP Client (reqwest)
// ============================================================

/// Send a real HTTP request using reqwest
pub async fn send_request(config: HttpRequestConfig) -> AppResult<HttpResponse> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(config.timeout_ms))
        .build()
        .map_err(|e| AppError::with_source(ErrorCode::AiRequestFailed, "Failed to build HTTP client", e.to_string()))?;

    let start = std::time::Instant::now();

    let mut req = match config.method {
        HttpMethod::Get => client.get(&config.url),
        HttpMethod::Post => client.post(&config.url),
        HttpMethod::Put => client.put(&config.url),
        HttpMethod::Delete => client.delete(&config.url),
    };

    // Inject headers
    for (key, value) in &config.headers {
        req = req.header(key.as_str(), value.as_str());
    }

    // Attach body for POST/PUT
    if let Some(body) = &config.body {
        req = req.header("Content-Type", "application/json").body(body.clone());
    }

    let response = req.send().await.map_err(|e| {
        if e.is_timeout() {
            AppError::new(ErrorCode::NetworkTimeout, "Request timed out")
        } else if e.is_connect() {
            AppError::new(ErrorCode::ConnectionRefused, format!("Connection refused: {}", e))
        } else if e.is_request() {
            AppError::new(ErrorCode::DnsResolveFailed, format!("DNS/network error: {}", e))
        } else {
            AppError::with_source(ErrorCode::AiRequestFailed, "HTTP request failed", e.to_string())
        }
    })?;

    let status = response.status().as_u16();
    let elapsed_ms = start.elapsed().as_millis() as u64;

    // Collect response headers
    let mut resp_headers = std::collections::HashMap::new();
    for (name, value) in response.headers().iter() {
        if let Ok(v) = value.to_str() {
            resp_headers.insert(name.to_string(), v.to_string());
        }
    }

    let body = response.text().await.map_err(|e| {
        AppError::with_source(ErrorCode::AiRequestFailed, "Failed to read response body", e.to_string())
    })?;

    Ok(HttpResponse { status, headers: resp_headers, body, elapsed_ms })
}

// ============================================================
// AI SSE Streaming
// ============================================================

/// Send a streaming chat completion request and emit Tauri events for each token.
/// Returns the full concatenated response text.
pub async fn ai_stream_request(
    app: tauri::AppHandle,
    proxy_config: &AiProxyConfig,
    agent_id: &str,
    messages_json: &str,
) -> AppResult<String> {
    let messages: serde_json::Value = serde_json::from_str(messages_json)
        .map_err(|e| AppError::with_source(ErrorCode::SerializeError, "Failed to parse messages JSON", e.to_string()))?;

    let body = serde_json::json!({
        "model": proxy_config.model,
        "messages": messages,
        "stream": true,
    });

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_millis(proxy_config.timeout_ms))
        .build()
        .map_err(|e| AppError::with_source(ErrorCode::AiRequestFailed, "Failed to build HTTP client", e.to_string()))?;

    let url = format!("{}/chat/completions", proxy_config.api_base.trim_end_matches('/'));

    let response = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", proxy_config.api_key))
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                AppError::new(ErrorCode::NetworkTimeout, "AI request timed out")
            } else if e.is_connect() {
                AppError::new(ErrorCode::ConnectionRefused, format!("Cannot connect to AI API: {}", e))
            } else {
                AppError::with_source(ErrorCode::AiRequestFailed, "AI request failed", e.to_string())
            }
        })?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body_text = response.text().await.unwrap_or_default();

        // Detect auth errors
        if status == 401 || status == 403 {
            return Err(AppError::new(ErrorCode::AiTokenInvalid,
                format!("API authentication failed ({}): {}", status, body_text)));
        }
        if status == 404 {
            return Err(AppError::new(ErrorCode::AiModelUnavailable,
                format!("Model/endpoint not found ({}): {}", status, body_text)));
        }

        return Err(AppError::new(ErrorCode::AiRequestFailed,
            format!("API error {}: {}", status, body_text)));
    }

    let mut stream = response.bytes_stream();
    let mut full_response = String::new();
    let mut buffer = String::new();
    let mut chunk_index: u64 = 0;

    use futures::StreamExt;

    while let Some(chunk_result) = stream.next().await {
        match chunk_result {
            Ok(ref bytes) => {
                let text = String::from_utf8_lossy(bytes);
                buffer.push_str(&text);

                // Process complete SSE lines
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() { continue; }

                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            let _ = app.emit("ai-stream-done", serde_json::json!({
                                "agent_id": agent_id,
                                "full_response": full_response,
                            }));
                            return Ok(full_response);
                        }

                        if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(content) = parsed["choices"][0]["delta"]["content"].as_str() {
                                full_response.push_str(content);
                                let _ = app.emit("ai-stream-chunk", serde_json::json!({
                                    "agent_id": agent_id,
                                    "chunk": content,
                                    "index": chunk_index,
                                }));
                                chunk_index += 1;
                            }
                        }
                    }
                }
            }
            Err(e) => {
                // If we have partial response, emit it before error
                if !full_response.is_empty() {
                    let _ = app.emit("ai-stream-done", serde_json::json!({
                        "agent_id": agent_id,
                        "full_response": full_response,
                    }));
                }
                let _ = app.emit("ai-stream-error", serde_json::json!({
                    "agent_id": agent_id,
                    "error": format!("Stream interrupted: {}", e),
                }));
                return Err(AppError::with_source(ErrorCode::AiStreamInterrupted, "SSE stream error", e.to_string()));
            }
        }
    }

    // Stream ended naturally (no [DONE] marker)
    let _ = app.emit("ai-stream-done", serde_json::json!({
        "agent_id": agent_id,
        "full_response": full_response,
    }));
    Ok(full_response)
}

// ============================================================
// AI Proxy Config Helpers
// ============================================================

/// Load AI proxy config from Rust encrypted storage.
/// Reads token from `token.enc` and API base/model from `config.json`.
pub async fn load_ai_proxy_config(app_handle: &tauri::AppHandle) -> AppResult<AiProxyConfig> {
    use tauri::Manager;
    let data_dir = app_handle.path().app_data_dir()
        .map_err(|e| AppError::with_source(ErrorCode::IoError, "Cannot get app data dir", e.to_string()))?;

    // Load encrypted token
    let token = crate::storage::load_token(&data_dir).unwrap_or_default();

    // Load config
    let config = crate::storage::read_config(&data_dir).unwrap_or_default();

    Ok(AiProxyConfig {
        api_base: config.ai_api_base,
        api_key: token,
        model: config.ai_model,
        timeout_ms: 60000,
        proxy_enabled: false,
        proxy_url: None,
    })
}

/// Check network connectivity by making a HEAD request
pub async fn check_connectivity(url: &str) -> AppResult<bool> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|_| AppError::new(ErrorCode::ConnectionRefused, "Failed to build HTTP client"))?;

    match client.head(url).send().await {
        Ok(resp) => Ok(resp.status().is_success() || resp.status().as_u16() < 500),
        Err(_) => Ok(false),
    }
}
