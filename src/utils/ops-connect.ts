/**
 * 运维连接工具 — 按需连接/释放临时 SSH 会话
 * 已连接的服务器复用现有会话，未连接的临时连接、用完断开
 */
import { useSshStore } from '@/stores/ssh'

export interface ResolvedSession { id: string; transient: boolean }

/** 取得可用 realSessionId：已连接复用，否则临时连接 */
export async function resolveSession(server: any): Promise<ResolvedSession | null> {
  const sshStore = useSshStore()
  const existing = sshStore.sessions.find(s => s.serverId === server.id && s.status === 'connected' && s.realSessionId)
  if (existing?.realSessionId) return { id: existing.realSessionId, transient: false }
  try {
    const { sshConnect } = await import('@/api/tauri')
    const res = await sshConnect({
      host: server.host, port: server.port, username: server.username,
      auth: server.authType === 'password'
        ? { type: 'password', password: server.password || '' }
        : { type: 'private_key', key_path: server.keyPath || '' },
      timeout_ms: 10000, remark: '', pinned: false,
    })
    return { id: res.session_id, transient: true }
  } catch { return null }
}

/** 释放临时会话 */
export async function releaseSession(sess: ResolvedSession | null): Promise<void> {
  if (sess?.transient) {
    try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(sess.id) } catch {}
  }
}
