/**
 * Tauri 后端类型定义
 * 与 Rust 后端结构体一一对应
 * SSH增强：预检连接 + SFTP文件操作 + 拓展字段
 */

/** 统一错误结构 */
export interface AppError {
  error_code: string
  message: string
  source?: string
}

/** 应用配置 */
export interface AppConfig {
  ai_token_encrypted?: string
  ai_api_base: string
  ai_model: string
  active_agent_id?: string
  window_width: number
  window_height: number
  ssh_servers: SshServerConfig[]
  quick_commands: QuickCommand[]
}

/** SSH 服务器配置 */
export interface SshServerConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  auth_type: string
  password_encrypted?: string
  key_path?: string
  remark: string
  pinned: boolean
  custom_timeout_ms: number
  group: string
  last_connected_at: number
}

/** 快捷命令收藏 */
export interface QuickCommand {
  id: string
  name: string
  command: string
  description: string
}

/** SSH 连接配置（用于预检） */
export interface SshConnectConfig {
  host: string
  port: number
  username: string
  auth: SshAuthMethod
  timeout_ms: number
  remark: string
  pinned: boolean
}

/** SSH 认证方式 */
export type SshAuthMethod =
  | { type: 'password'; password: string }
  | { type: 'private_key'; key_path: string; passphrase?: string }
  | { type: 'agent' }

/** SSH 会话信息（真实连接后返回） */
export interface SshSessionInfo {
  session_id: string
  config: SshConnectConfig
  state: string
}

/** SSH 预检结果 */
export interface SshTestResult {
  reachable: boolean
  error_type?: SshTestErrorType
  error_message?: string
  latency_ms?: number
}

/** 预检错误分类 */
export type SshTestErrorType = 'PORT_UNREACHABLE' | 'AUTH_FAILED' | 'INVALID_KEY' | 'FIREWALL_BLOCKED'

/** 文件类型 */
export type FileType = 'FILE' | 'DIRECTORY' | 'SYMLINK' | 'OTHER'

/** 文件条目 */
export interface FileEntry {
  name: string
  path: string
  file_type: FileType
  size: number
  modified: number
  permissions: number
  is_hidden: boolean
}

/** 目录列表 */
export interface DirectoryListing {
  path: string
  entries: FileEntry[]
  complete: boolean
}

/** 传输进度 */
export interface TransferProgress {
  transfer_id: string
  transferred: number
  total: number
  speed: number
  done: boolean
}

/** AI 对话请求 */
export interface AiChatRequest {
  agent_id: string
  message: string
  history: AiChatMessage[]
}

/** AI 对话消息 */
export interface AiChatMessage {
  role: string
  content: string
}

/** AI 对话响应 */
export interface AiChatResponse {
  agent_id: string
  reply: string
  success: boolean
  error?: string
}

/** 系统信息 */
export interface SystemInfo {
  os: string
  arch: string
  rust_version: string
  app_version: string
}

/** 智能体定义 */
export interface AgentDefinition {
  id: string
  name: string
  icon: string
  system_prompt: string
  description: string
  capabilities: string[]
}

/** 4套内置智能体ID常量 */
export const AGENT_IDS = {
  CODING: 'coding-assistant',
  OPS: 'ops-assistant',
  DATA: 'data-assistant',
  GENERAL: 'general-assistant',
} as const

/** 4套内置智能体显示信息 */
export const AGENT_LIST: Array<{ id: string; name: string; icon: string; description: string }> = [
  { id: AGENT_IDS.CODING, name: '编程助手', icon: '💻', description: '代码开发、架构设计、技术选型' },
  { id: AGENT_IDS.OPS, name: '运维助手', icon: '🔧', description: '服务器运维、故障排查、性能优化' },
  { id: AGENT_IDS.DATA, name: '数据分析', icon: '📊', description: '数据分析、SQL优化、可视化建模' },
  { id: AGENT_IDS.GENERAL, name: '通用助手', icon: '🤖', description: '通用问答、文档撰写、日常辅助' },
]
