/**
 * SSH Tauri指令前端API封装
 * 对接Rust后端 SSH 模块
 * 支持: connect → open_shell → write/resize → listen events → disconnect
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

// ============================================================
// Types
// ============================================================

export interface SshConnectParams {
  host: string
  port: number
  username: string
  auth: SshAuthMethod
  timeout_ms: number
  remark: string
  pinned: boolean
}

export type SshAuthMethod =
  | { type: 'password'; password: string }
  | { type: 'private_key'; key_path: string; passphrase?: string }
  | { type: 'agent' }

export interface SshSessionInfo {
  session_id: string
  config: SshConnectParams
  state: string
}

export interface SshTestResult {
  reachable: boolean
  error_type?: string
  error_message?: string
  latency_ms?: number
}

// ============================================================
// SSH连接指令
// ============================================================

/** 测试SSH连通性 */
export async function sshTestConnect(config: SshConnectParams): Promise<SshTestResult> {
  return invoke<SshTestResult>('ssh_test_connect', { config })
}

/** 建立SSH连接 */
export async function sshConnect(config: SshConnectParams): Promise<SshSessionInfo> {
  return invoke<SshSessionInfo>('ssh_connect', { config })
}

/** 打开交互式Shell（PTY分配） */
export async function sshOpenShell(
  sessionId: string,
  cols: number = 80,
  rows: number = 24
): Promise<void> {
  return invoke<void>('ssh_open_shell', { sessionId, cols, rows })
}

/** 向Shell写入数据（键盘输入） */
export async function sshWrite(sessionId: string, data: string | Uint8Array): Promise<void> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  return invoke<void>('ssh_write', { sessionId, data: Array.from(bytes) })
}

/** 调整PTY终端尺寸 */
export async function sshResize(
  sessionId: string,
  cols: number,
  rows: number
): Promise<void> {
  return invoke<void>('ssh_resize', { sessionId, cols, rows })
}

/** 断开SSH连接 */
export async function sshDisconnect(sessionId: string): Promise<void> {
  return invoke<void>('ssh_disconnect', { sessionId })
}

/** 执行单条命令（非交互式） */
export async function sshExec(sessionId: string, command: string): Promise<string> {
  return invoke<string>('ssh_exec', { sessionId, command })
}

// ============================================================
// 事件监听
// ============================================================

interface SshDataEvent {
  sessionId: string
  data: string
}

interface SshStatusEvent {
  sessionId: string
  status: string
  error?: string
}

/** 监听SSH终端数据输出 */
export function onSshData(
  sessionId: string,
  callback: (data: string) => void
): Promise<UnlistenFn> {
  return listen<SshDataEvent>('ssh-data', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.data)
    }
  })
}

/** 监听SSH连接状态变化 */
export function onSshStatus(
  sessionId: string,
  callback: (status: string, error?: string) => void
): Promise<UnlistenFn> {
  return listen<SshStatusEvent>('ssh-status', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.status, event.payload.error)
    }
  })
}

/** 全局监听所有SSH数据事件 */
export function onAllSshData(
  callback: (sessionId: string, data: string) => void
): Promise<UnlistenFn> {
  return listen<SshDataEvent>('ssh-data', (event) => {
    callback(event.payload.sessionId, event.payload.data)
  })
}
