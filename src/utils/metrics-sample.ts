/**
 * 集群指标快速采样 —— 一次 exec 拉取 CPU/内存/磁盘/负载
 * 供运维总览仪表盘使用（跨多台已连接服务器并发采样）
 */
import { sshExec } from '@/api/tauri'

export interface QuickMetrics {
  cpu: number
  mem: number
  disk: number
  load: number
  cores: number
  ok: boolean
}

/** 单条命令拉取全部指标，减少往返 */
const SAMPLE_CMD = [
  'echo "@CPU@"; top -bn1 2>/dev/null | grep "Cpu(s)"',
  'echo "@MEM@"; free -b 2>/dev/null | grep "^Mem:"',
  'echo "@DISK@"; df -Ph 2>/dev/null',
  'echo "@LOAD@"; cat /proc/loadavg 2>/dev/null',
  'echo "@CORES@"; nproc 2>/dev/null',
].join('; ')

function section(raw: string, tag: string): string {
  const start = raw.indexOf(`@${tag}@`)
  if (start === -1) return ''
  const rest = raw.slice(start + tag.length + 2)
  const next = rest.search(/@[A-Z]+@/)
  return (next === -1 ? rest : rest.slice(0, next)).trim()
}

export async function sampleMetrics(sessionId: string): Promise<QuickMetrics> {
  const empty: QuickMetrics = { cpu: 0, mem: 0, disk: 0, load: 0, cores: 1, ok: false }
  if (!sessionId) return empty
  let raw = ''
  try { raw = (await sshExec(sessionId, SAMPLE_CMD)).trim() } catch { return empty }
  if (!raw) return empty

  // CPU
  let cpu = 0
  const cm = section(raw, 'CPU').match(/([\d.]+)\s*us.*?([\d.]+)\s*sy/)
  if (cm) cpu = Math.round((parseFloat(cm[1]) + parseFloat(cm[2])) * 10) / 10

  // Mem
  let mem = 0
  const memParts = section(raw, 'MEM').trim().split(/\s+/)
  if (memParts.length >= 3) { const t = parseInt(memParts[1]) || 0, u = parseInt(memParts[2]) || 0; mem = t > 0 ? Math.round((u / t) * 1000) / 10 : 0 }

  // Disk（最高使用率真实分区）
  let disk = 0
  for (const line of section(raw, 'DISK').split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    if (/^(tmpfs|devtmpfs|overlay|none|udev)/.test(p[0]) || p[0].startsWith('/dev/loop')) continue
    disk = Math.max(disk, parseInt(p[4]) || 0)
  }

  const load = parseFloat(section(raw, 'LOAD').split(/\s+/)[0]) || 0
  const cores = parseInt(section(raw, 'CORES')) || 1
  return { cpu, mem, disk, load, cores, ok: true }
}
