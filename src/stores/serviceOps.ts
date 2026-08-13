/**
 * 服务运维 store — 跨服务器的中间件/业务服务巡检
 * 支持 Redis / MySQL / PostgreSQL / MongoDB / Nginx / Docker + 自定义业务端口
 * 每个服务：探测存活 + 采集关键指标 + 原始输出（供 AI 分析）
 * 纯只读命令，凭据缺失时优雅降级（端口/进程/systemd 探测）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sshExec } from '@/api/tauri'

export type ServiceStatus = 'running' | 'stopped' | 'degraded' | 'unknown'
export interface ServiceMetric { label: string; value: string; severity?: 'ok' | 'warning' | 'critical' }
export interface ServiceResult {
  serviceId: string
  serviceName: string
  present: boolean
  status: ServiceStatus
  metrics: ServiceMetric[]
  raw: string
}
export interface ServerServiceReport {
  serverId: string
  serverName: string
  status: 'running' | 'done' | 'failed'
  services: ServiceResult[]
}

interface ServiceDef {
  id: string
  name: string
  port: number
  cmd: string
  parse: (raw: string) => { present: boolean; status: ServiceStatus; metrics: ServiceMetric[] }
}

// ── 解析辅助 ──
function kv(raw: string, key: string): string {
  const m = raw.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*[:=]\\s*(.+)`, 'i'))
  return m ? m[1].trim() : ''
}
function fmtUptime(sec: number): string {
  if (!sec) return '-'
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`; if (h > 0) return `${h}h ${m}m`; return `${m}m`
}

// ── 服务目录 ──
export const SERVICE_CATALOG: ServiceDef[] = [
  {
    id: 'redis', name: 'Redis', port: 6379,
    cmd: `echo "PING:$(redis-cli ping 2>/dev/null)"; redis-cli info 2>/dev/null | grep -E "^(redis_version|uptime_in_seconds|connected_clients|used_memory_human|maxmemory_human|role|keyspace_hits|keyspace_misses):"; ss -tlnp 2>/dev/null | grep -q ':6379' && echo "PORT:open"`,
    parse: (raw) => {
      const pong = /PONG/.test(raw)
      const portOpen = /PORT:open/.test(raw) || !!kv(raw, 'redis_version')
      const present = pong || portOpen
      const status: ServiceStatus = pong ? 'running' : portOpen ? 'degraded' : 'stopped'
      const hits = parseInt(kv(raw, 'keyspace_hits')) || 0
      const misses = parseInt(kv(raw, 'keyspace_misses')) || 0
      const hitRate = hits + misses > 0 ? Math.round((hits / (hits + misses)) * 1000) / 10 : null
      const clients = parseInt(kv(raw, 'connected_clients')) || 0
      const metrics: ServiceMetric[] = []
      if (kv(raw, 'redis_version')) metrics.push({ label: '版本', value: kv(raw, 'redis_version') })
      if (kv(raw, 'uptime_in_seconds')) metrics.push({ label: '运行', value: fmtUptime(parseInt(kv(raw, 'uptime_in_seconds'))) })
      if (kv(raw, 'role')) metrics.push({ label: '角色', value: kv(raw, 'role') })
      metrics.push({ label: '连接数', value: String(clients), severity: clients > 5000 ? 'warning' : 'ok' })
      if (kv(raw, 'used_memory_human')) metrics.push({ label: '内存', value: kv(raw, 'used_memory_human') })
      if (hitRate !== null) metrics.push({ label: '命中率', value: hitRate + '%', severity: hitRate < 80 ? 'warning' : 'ok' })
      return { present, status, metrics }
    },
  },
  {
    id: 'mysql', name: 'MySQL / MariaDB', port: 3306,
    cmd: `systemctl is-active mysql mariadb mysqld 2>/dev/null | grep -m1 active; echo "---"; mysqladmin status 2>/dev/null; ss -tlnp 2>/dev/null | grep -q ':3306' && echo "PORT:open"; pgrep -x mysqld >/dev/null 2>&1 && echo "PROC:up"; pgrep -x mariadbd >/dev/null 2>&1 && echo "PROC:up"`,
    parse: (raw) => {
      const active = /\bactive\b/.test(raw)
      const statusLine = raw.match(/Uptime:\s*(\d+).*?Threads:\s*(\d+).*?Questions:\s*(\d+).*?Slow queries:\s*(\d+)/s)
      const portOpen = /PORT:open/.test(raw); const procUp = /PROC:up/.test(raw)
      const present = active || portOpen || procUp || !!statusLine
      const status: ServiceStatus = (active || statusLine) ? 'running' : (portOpen || procUp) ? 'degraded' : 'stopped'
      const metrics: ServiceMetric[] = []
      if (statusLine) {
        metrics.push({ label: '运行', value: fmtUptime(parseInt(statusLine[1])) })
        const threads = parseInt(statusLine[2])
        metrics.push({ label: '连接线程', value: String(threads), severity: threads > 200 ? 'warning' : 'ok' })
        metrics.push({ label: '查询数', value: statusLine[3] })
        const slow = parseInt(statusLine[4])
        metrics.push({ label: '慢查询', value: String(slow), severity: slow > 100 ? 'warning' : 'ok' })
      }
      return { present, status, metrics }
    },
  },
  {
    id: 'postgres', name: 'PostgreSQL', port: 5432,
    cmd: `pg_isready 2>/dev/null; echo "---"; systemctl is-active postgresql 2>/dev/null; ss -tlnp 2>/dev/null | grep -q ':5432' && echo "PORT:open"; pgrep -x postgres >/dev/null 2>&1 && echo "PROC:up"`,
    parse: (raw) => {
      const ready = /accepting connections/i.test(raw)
      const active = /\bactive\b/.test(raw)
      const portOpen = /PORT:open/.test(raw); const procUp = /PROC:up/.test(raw)
      const present = ready || active || portOpen || procUp
      const status: ServiceStatus = ready || active ? 'running' : (portOpen || procUp) ? 'degraded' : 'stopped'
      const metrics: ServiceMetric[] = []
      metrics.push({ label: '就绪', value: ready ? '是' : '否', severity: ready ? 'ok' : 'warning' })
      return { present, status, metrics }
    },
  },
  {
    id: 'mongodb', name: 'MongoDB', port: 27017,
    cmd: `systemctl is-active mongod 2>/dev/null; ss -tlnp 2>/dev/null | grep -q ':27017' && echo "PORT:open"; pgrep -x mongod >/dev/null 2>&1 && echo "PROC:up"; mongosh --quiet --eval "print('CONN:'+db.serverStatus().connections.current)" 2>/dev/null || mongo --quiet --eval "print('CONN:'+db.serverStatus().connections.current)" 2>/dev/null`,
    parse: (raw) => {
      const active = /\bactive\b/.test(raw)
      const portOpen = /PORT:open/.test(raw); const procUp = /PROC:up/.test(raw)
      const conn = kv(raw, 'CONN') || (raw.match(/CONN:(\d+)/)?.[1] ?? '')
      const present = active || portOpen || procUp
      const status: ServiceStatus = active ? 'running' : (portOpen || procUp) ? 'degraded' : 'stopped'
      const metrics: ServiceMetric[] = []
      if (conn) metrics.push({ label: '当前连接', value: conn })
      return { present, status, metrics }
    },
  },
  {
    id: 'nginx', name: 'Nginx', port: 80,
    cmd: `nginx -t 2>&1 | tail -2; echo "---"; systemctl is-active nginx 2>/dev/null; echo "WORKERS:$(pgrep -c nginx 2>/dev/null)"; ss -tlnp 2>/dev/null | grep -qE ':80|:443' && echo "PORT:open"`,
    parse: (raw) => {
      const active = /\bactive\b/.test(raw)
      const workers = parseInt(raw.match(/WORKERS:(\d+)/)?.[1] || '0')
      const portOpen = /PORT:open/.test(raw)
      const cfgOk = /syntax is ok/i.test(raw)
      const cfgFail = /\[emerg\]|test failed/i.test(raw)
      const present = active || workers > 0 || portOpen
      const status: ServiceStatus = cfgFail ? 'degraded' : (active || workers > 0) ? 'running' : portOpen ? 'degraded' : 'stopped'
      const metrics: ServiceMetric[] = []
      metrics.push({ label: '配置', value: cfgFail ? '错误' : cfgOk ? '正常' : '未知', severity: cfgFail ? 'critical' : 'ok' })
      metrics.push({ label: 'Worker', value: String(workers) })
      return { present, status, metrics }
    },
  },
  {
    id: 'docker', name: 'Docker', port: 0,
    cmd: `systemctl is-active docker 2>/dev/null; echo "---CONTAINERS---"; docker ps --format "{{.Names}}|{{.Status}}" 2>/dev/null`,
    parse: (raw) => {
      const active = /\bactive\b/.test(raw)
      const body = raw.split('---CONTAINERS---')[1] || ''
      const lines = body.split('\n').map(l => l.trim()).filter(Boolean)
      const running = lines.filter(l => /\|Up /i.test(l)).length
      const unhealthy = lines.filter(l => /unhealthy|Restarting|Exited/i.test(l)).length
      const present = active || lines.length > 0
      const status: ServiceStatus = active ? (unhealthy > 0 ? 'degraded' : 'running') : lines.length > 0 ? 'running' : 'stopped'
      const metrics: ServiceMetric[] = []
      metrics.push({ label: '运行容器', value: String(running) })
      if (unhealthy > 0) metrics.push({ label: '异常容器', value: String(unhealthy), severity: 'critical' })
      return { present, status, metrics }
    },
  },
]

/** 自定义端口检查 */
function customPortDef(port: number): ServiceDef {
  return {
    id: `port-${port}`, name: `端口 ${port}`, port,
    cmd: `ss -tlnp 2>/dev/null | grep ':${port} ' | head -1 || echo "CLOSED"`,
    parse: (raw) => {
      const closed = /CLOSED/.test(raw) || !raw.trim()
      const proc = raw.match(/users:\(\("([^"]+)"/)?.[1] || ''
      const metrics: ServiceMetric[] = []
      if (proc) metrics.push({ label: '监听进程', value: proc })
      return { present: !closed, status: closed ? 'stopped' : 'running', metrics }
    },
  }
}

export const useServiceOpsStore = defineStore('serviceOps', () => {
  const running = ref(false)
  const reports = ref<ServerServiceReport[]>(loadReports())

  const REPORTS_KEY = 'ops-service-reports'
  function loadReports(): ServerServiceReport[] {
    try { const s = localStorage.getItem(REPORTS_KEY); if (s) return JSON.parse(s) } catch {}
    return []
  }
  function saveReports() { try { localStorage.setItem(REPORTS_KEY, JSON.stringify(reports.value)) } catch {} }
  function clearLocalReports() { reports.value = []; try { localStorage.removeItem(REPORTS_KEY) } catch {} }

  async function exec(sessionId: string, cmd: string): Promise<string> {
    try { return (await sshExec(sessionId, cmd)).trim() } catch { return '' }
  }

  /** 对单台服务器检查指定服务 */
  async function checkServer(sessionId: string, serviceIds: string[], customPorts: number[]): Promise<ServiceResult[]> {
    const defs: ServiceDef[] = [
      ...SERVICE_CATALOG.filter(s => serviceIds.includes(s.id)),
      ...customPorts.map(customPortDef),
    ]
    const results: ServiceResult[] = []
    for (const def of defs) {
      const raw = await exec(sessionId, def.cmd)
      const parsed = def.parse(raw)
      results.push({ serviceId: def.id, serviceName: def.name, ...parsed, raw })
    }
    return results
  }

  /** 构建 AI 分析提示词 */
  function buildAiPrompt(): string {
    const lines: string[] = ['以下是多台服务器的服务运维巡检结果，请作为资深运维专家分析各服务健康状况、指出风险并给出优先处置建议（简洁中文分点）：\n']
    for (const rep of reports.value) {
      lines.push(`## ${rep.serverName}`)
      for (const svc of rep.services) {
        if (!svc.present) { lines.push(`- ${svc.serviceName}: 未检测到`); continue }
        const m = svc.metrics.map(x => `${x.label}=${x.value}`).join(', ')
        lines.push(`- ${svc.serviceName}: ${svc.status}${m ? '（' + m + '）' : ''}`)
      }
      lines.push('')
    }
    return lines.join('\n').slice(0, 5000)
  }

  return { running, reports, checkServer, buildAiPrompt, saveReports, clearLocalReports }
})
