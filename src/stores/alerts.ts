/**
 * 实时告警 store
 * 轮询采集关键指标 → 按阈值规则判定 → 产生告警事件
 * 复用 monitor 的命令模式，纯只读
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sshExec } from '@/api/tauri'

export type AlertMetric = 'cpu' | 'mem' | 'disk' | 'load'
export type Severity = 'critical' | 'warning'

export interface AlertRule {
  metric: AlertMetric
  threshold: number
  enabled: boolean
  severity: Severity
}

export interface AlertEvent {
  id: string
  ts: number
  serverId: string
  serverName: string
  metric: AlertMetric
  value: number
  threshold: number
  severity: Severity
  read: boolean
}

const DEFAULT_RULES: AlertRule[] = [
  { metric: 'cpu', threshold: 85, enabled: true, severity: 'warning' },
  { metric: 'mem', threshold: 90, enabled: true, severity: 'critical' },
  { metric: 'disk', threshold: 85, enabled: true, severity: 'warning' },
  { metric: 'load', threshold: 0, enabled: true, severity: 'warning' }, // 0 => 动态用 cores×2
]

const STORAGE_KEY = 'ops-alert-rules'
let _seq = 0

async function exec(sessionId: string, cmd: string): Promise<string> {
  try { return (await sshExec(sessionId, cmd)).trim() } catch { return '' }
}

/** 采集当前指标 */
async function sampleMetrics(sessionId: string): Promise<{ cpu: number; mem: number; disk: number; load: number; cores: number }> {
  const [cpuRaw, memRaw, dfRaw, loadRaw, nprocRaw] = await Promise.all([
    exec(sessionId, 'top -bn1 2>/dev/null | grep "Cpu(s)"'),
    exec(sessionId, 'free -b 2>/dev/null'),
    exec(sessionId, 'df -Ph 2>/dev/null'),
    exec(sessionId, 'cat /proc/loadavg 2>/dev/null'),
    exec(sessionId, 'nproc 2>/dev/null'),
  ])
  // CPU
  let cpu = 0
  const cm = cpuRaw.match(/([\d.]+)\s*us.*?([\d.]+)\s*sy/)
  if (cm) cpu = Math.round((parseFloat(cm[1]) + parseFloat(cm[2])) * 10) / 10
  // Mem
  let mem = 0
  const memLine = memRaw.split('\n').find(l => l.startsWith('Mem:'))
  if (memLine) { const p = memLine.trim().split(/\s+/); const t = parseInt(p[1]) || 0, u = parseInt(p[2]) || 0; mem = t > 0 ? Math.round((u / t) * 1000) / 10 : 0 }
  // Disk（取最高使用率的真实分区）
  let disk = 0
  for (const line of dfRaw.split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    if (/^(tmpfs|devtmpfs|overlay|none|udev)/.test(p[0]) || p[0].startsWith('/dev/loop')) continue
    disk = Math.max(disk, parseInt(p[4]) || 0)
  }
  const load = parseFloat(loadRaw.split(/\s+/)[0]) || 0
  const cores = parseInt(nprocRaw) || 1
  return { cpu, mem, disk, load, cores }
}

export const useAlertStore = defineStore('alerts', () => {
  const rules = ref<AlertRule[]>(loadRules())
  const events = ref<AlertEvent[]>([])
  const watching = ref(false)
  const currentSample = ref<{ cpu: number; mem: number; disk: number; load: number; cores: number } | null>(null)
  let timer: ReturnType<typeof setInterval> | null = null

  const unreadCount = computed(() => events.value.filter(e => !e.read).length)

  function loadRules(): AlertRule[] {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) return JSON.parse(s) } catch {}
    return JSON.parse(JSON.stringify(DEFAULT_RULES))
  }
  function saveRules() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules.value)) } catch {} }

  function evaluate(serverId: string, serverName: string, m: { cpu: number; mem: number; disk: number; load: number; cores: number }) {
    for (const rule of rules.value) {
      if (!rule.enabled) continue
      const threshold = rule.metric === 'load' ? (rule.threshold > 0 ? rule.threshold : m.cores * 2) : rule.threshold
      const value = m[rule.metric]
      if (value > threshold) {
        // 去抖：同指标 60s 内已有告警则跳过
        const recent = events.value.find(e => e.serverId === serverId && e.metric === rule.metric && Date.now() - e.ts < 60000)
        if (recent) continue
        events.value.unshift({
          id: `a-${Date.now()}-${_seq++}`, ts: Date.now(), serverId, serverName,
          metric: rule.metric, value, threshold, severity: rule.severity, read: false,
        })
        if (events.value.length > 100) events.value = events.value.slice(0, 100)
      }
    }
  }

  async function tick(sessionId: string, serverId: string, serverName: string) {
    if (!sessionId) return
    const m = await sampleMetrics(sessionId)
    currentSample.value = m
    evaluate(serverId, serverName, m)
  }

  function startWatch(sessionId: string, serverId: string, serverName: string, intervalMs = 10000) {
    stopWatch()
    if (!sessionId) return
    watching.value = true
    tick(sessionId, serverId, serverName)
    timer = setInterval(() => tick(sessionId, serverId, serverName), intervalMs)
  }
  function stopWatch() { if (timer) { clearInterval(timer); timer = null } watching.value = false }

  function markAllRead() { events.value.forEach(e => e.read = true) }
  function clearEvents() { events.value = [] }
  function resetRules() { rules.value = JSON.parse(JSON.stringify(DEFAULT_RULES)); saveRules() }

  return { rules, events, watching, currentSample, unreadCount, saveRules, startWatch, stopWatch, markAllRead, clearEvents, resetRules }
})
