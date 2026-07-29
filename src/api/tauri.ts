/**
 * Tauri 后端通信封装层
 * 统一封装所有 invoke 调用，提供类型安全的 API
 * SSH增强：预检连接 + SFTP全套CRUD + 拖拽上传下载
 */

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  AppConfig, AiChatRequest, AiChatResponse, AiTestRequest, AiTestResponse, SystemInfo,
  SshConnectConfig, SshTestResult, SshSessionInfo,
  DirectoryListing, FileEntry, TransferProgress
} from '../types/tauri'

// ============================================================
// Token 相关 API
// ============================================================

export async function saveToken(token: string): Promise<void> {
  return invoke<void>('save_token', { token })
}

export async function loadToken(): Promise<string> {
  return invoke<string>('load_token')
}

export async function deleteToken(): Promise<void> {
  return invoke<void>('delete_token')
}

export async function hasToken(): Promise<boolean> {
  return invoke<boolean>('has_token')
}

// ============================================================
// 配置相关 API
// ============================================================

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke<void>('save_config', { config })
}

export async function loadConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('load_config')
}

// ============================================================
// SSH 预检连接 API
// ============================================================

/** SSH 预检连接（仅握手鉴权，不创建持久会话） */
export async function sshTestConnect(config: SshConnectConfig): Promise<SshTestResult> {
  return invoke<SshTestResult>('ssh_test_connect', { config })
}

/** 真实SSH连接（建立持久会话） */
export async function sshConnect(config: SshConnectConfig): Promise<SshSessionInfo> {
  return invoke<SshSessionInfo>('ssh_connect', { config })
}

/** 断开SSH连接 */
export async function sshDisconnect(sessionId: string): Promise<void> {
  return invoke<void>('ssh_disconnect', { sessionId })
}

/** 通过SSH执行命令（exec通道，非交互式） */
export async function sshExec(sessionId: string, command: string): Promise<string> {
  return invoke<string>('ssh_exec', { sessionId, command })
}

/** 命令执行结构化结果 — 对应 Rust ExecResult */
export interface SshExecResult {
  stdout: string
  stderr: string
  /** 远端进程退出码；超时或未收到时为 null */
  exit_code: number | null
  /** 命令在超时时间内未结束时为 true */
  timed_out: boolean
}

/** 执行命令并返回结构化结果（stdout/stderr/退出码/超时）— 供 AI 智能体判断成败 */
export async function sshExecFull(sessionId: string, command: string): Promise<SshExecResult> {
  return invoke<SshExecResult>('ssh_exec_full', { sessionId, command })
}

/** 打开交互式Shell（PTY分配 + shell启动，双向流） */
export async function sshOpenShell(sessionId: string, cols: number = 80, rows: number = 24): Promise<void> {
  return invoke<void>('ssh_open_shell', { sessionId, cols, rows })
}

/** 向Shell写入数据（用户键盘输入，PTY模式） */
export async function sshWrite(sessionId: string, data: string | Uint8Array): Promise<void> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return invoke<void>('ssh_write', { sessionId, data: Array.from(bytes) })
}

/** 调整PTY终端尺寸 */
export async function sshResize(sessionId: string, cols: number, rows: number): Promise<void> {
  return invoke<void>('ssh_resize', { sessionId, cols, rows })
}

/** 监听SSH终端数据输出（PTY shell数据） */
export function onSshData(sessionId: string, callback: (data: string) => void): Promise<() => void> {
  return listen<{ sessionId: string; data: string }>('ssh-data', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.data)
    }
  })
}

/** 监听SSH连接状态变化 */
export function onSshStatus(sessionId: string, callback: (status: string, error?: string) => void): Promise<() => void> {
  return listen<{ sessionId: string; status: string; error?: string }>('ssh-status', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.status, event.payload.error)
    }
  })
}

// ============================================================
// SFTP 文件操作 API
// ============================================================

/** 读取远端目录列表 */
export async function sftpReadDir(sessionId: string, path: string): Promise<DirectoryListing> {
  return invoke<DirectoryListing>('sftp_read_dir', { sessionId, path })
}

/** 新建远端目录 */
export async function sftpMkdir(sessionId: string, path: string): Promise<void> {
  return invoke<void>('sftp_mkdir', { sessionId, path })
}

/** 删除远端文件/目录 */
export async function sftpRemove(sessionId: string, path: string, recursive: boolean = false): Promise<void> {
  return invoke<void>('sftp_remove', { sessionId, path, recursive })
}

/** 重命名远端文件/目录 */
export async function sftpRename(sessionId: string, oldPath: string, newPath: string): Promise<void> {
  return invoke<void>('sftp_rename', { sessionId, oldPath, newPath })
}

/** 上传本地文件到远端（支持拖拽传入本地路径） */
export async function sftpUpload(sessionId: string, localPath: string, remotePath: string): Promise<TransferProgress> {
  return invoke<TransferProgress>('sftp_upload', { sessionId, localPath, remotePath })
}

/** 下载远端文件到本地 */
export async function sftpDownload(sessionId: string, remotePath: string, localPath: string): Promise<TransferProgress> {
  return invoke<TransferProgress>('sftp_download', { sessionId, remotePath, localPath })
}

/** 获取文件属性 */
export async function sftpStat(sessionId: string, path: string): Promise<FileEntry> {
  return invoke<FileEntry>('sftp_stat', { sessionId, path })
}

/** 修改文件/目录权限 */
export async function sftpChmod(sessionId: string, path: string, mode: string): Promise<void> {
  return invoke<void>('sftp_chmod', { sessionId, path, mode })
}

/** 新建空文件（touch） */
export async function sftpTouch(sessionId: string, path: string): Promise<void> {
  return invoke<void>('sftp_touch', { sessionId, path })
}

/** 压缩/解压文件 */
export async function sftpCompress(sessionId: string, sourcePath: string, targetPath: string, decompress: boolean = false): Promise<void> {
  return invoke<void>('sftp_compress', { request: { sessionId, sourcePath, targetPath, decompress } })
}

// ============================================================
// AI 对话 API
// ============================================================

export async function aiChat(request: AiChatRequest): Promise<AiChatResponse> {
  return invoke<AiChatResponse>('ai_chat', { request })
}

export async function aiChatStream(request: AiChatRequest): Promise<void> {
  return invoke<void>('ai_chat_stream', { request })
}

export async function onAiStreamChunk(
  callback: (data: { agent_id: string; chunk: string; index: number }) => void
) {
  return listen<{ agent_id: string; chunk: string; index: number }>('ai-stream-chunk', (event) => {
    callback(event.payload)
  })
}

export async function onAiStreamDone(
  callback: (data: { agent_id: string; full_response: string }) => void
) {
  return listen<{ agent_id: string; full_response: string }>('ai-stream-done', (event) => {
    callback(event.payload)
  })
}

/// AI API 连通性测试 — Rust reqwest 代理，绕过 CORS
export async function testAiConnection(request: AiTestRequest): Promise<AiTestResponse> {
  return invoke<AiTestResponse>('test_ai_connection', { request })
}

// ============================================================
// 系统信息 API
// ============================================================

export async function getSystemInfo(): Promise<SystemInfo> {
  return invoke<SystemInfo>('get_system_info')
}
