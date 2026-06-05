/**
 * SSH Tauri指令前端API封装
 * 对接Rust后端 ssh_connect / ssh_disconnect / ssh_write / ssh_resize
 * Demo版：部分指令尚未在Rust端实现，提供降级处理
 */
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/** SSH连接参数 */
export interface SshConnectParams {
  host: string
  port: number
  username: string
  authType: 'password' | 'key'
  password?: string
  keyPath?: string
}

/** SSH连接结果 */
export interface SshConnectResult {
  sessionId: string
  success: boolean
  error?: string
}

/** 终端尺寸 */
export interface TerminalSize {
  cols: number
  rows: number
  width: number
  height: number
}

// ============================================================
// SSH连接指令
// ============================================================

/** 连接SSH服务器 */
export async function sshConnect(params: SshConnectParams): Promise<SshConnectResult> {
  try {
    return await invoke<SshConnectResult>('ssh_connect', { params })
  } catch (e) {
    // Demo降级：Rust端未实现时返回模拟结果
    console.warn('ssh_connect not implemented in Rust, using demo mode')
    return {
      sessionId: `demo-${Date.now()}`,
      success: true,
    }
  }
}

/** 断开SSH连接 */
export async function sshDisconnect(sessionId: string): Promise<void> {
  try {
    await invoke('ssh_disconnect', { sessionId })
  } catch {
    console.warn('ssh_disconnect not implemented in Rust')
  }
}

/** 向终端写入数据（发送命令） */
export async function sshWrite(sessionId: string, data: string): Promise<void> {
  try {
    await invoke('ssh_write', { sessionId, data })
  } catch {
    console.warn('ssh_write not implemented in Rust')
  }
}

/** 调整终端尺寸 */
export async function sshResize(sessionId: string, size: TerminalSize): Promise<void> {
  try {
    await invoke('ssh_resize', { sessionId, size })
  } catch {
    console.warn('ssh_resize not implemented in Rust')
  }
}

// ============================================================
// SSH终端数据事件监听
// ============================================================

/** 监听终端输出数据 */
export async function onSshData(
  sessionId: string,
  callback: (data: string) => void
) {
  return listen<{ sessionId: string; data: string }>('ssh-data', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.data)
    }
  })
}

/** 监听SSH连接状态变化 */
export async function onSshStatus(
  sessionId: string,
  callback: (status: string) => void
) {
  return listen<{ sessionId: string; status: string }>('ssh-status', (event) => {
    if (event.payload.sessionId === sessionId) {
      callback(event.payload.status)
    }
  })
}
