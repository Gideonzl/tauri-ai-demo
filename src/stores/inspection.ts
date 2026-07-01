/**
 * 智能巡检 store
 * 一键采集服务器关键指标 → 本地规则引擎产出分级问题 + 健康分
 * 复用 server-diagnostics / monitor 的命令模式，纯只读安全命令
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { sshExec } from '@/api/tauri'

export type Severity = 'critical' | 'warning' | 'ok' | 'info'

export interface Finding {
  id: string
  category: string          // catDisk / catMemory / catCpu / catService / catProcess / catSystem
  severity: Severity
  title: string
  detail: string
  value?: string
  suggestion?: string
}

export interface InspectionReport {
  serverId: string
  serverName: string
  timestamp: number
  healthScore: number
  findings: Finding[]
  raw: string
  aiSummary: string
}

/** 采集用命令集（只读、快速、带兜底） */
const INSPECT_CMDS: Record<string, string> = {
  df: 'df -Ph 2>/dev/null',
  mem: 'free -b 2>/dev/null',
  loadavg: 'cat /proc/loadavg 2>/dev/null',
  nproc: 'nproc 2>/dev/null',
  uptime: 'cat /proc/uptime 2>/dev/null',
  ps: 'ps aux --sort=-%cpu 2>/dev/null | head -12',
  zombies: "ps aux 2>/dev/null | awk '$8 ~ /Z/ {c++} END{print c+0}'",
  failed: 'systemctl list-units --type=service --state=failed --no-legend --plain 2>/dev/null | head -20',
}

let _seq = 0
function fid(): string { return `f-${Date.now()}-${_seq++}` }

async function exec(sessionId: string, cmd: string): Promise<string> {
  try { return (await sshExec(sessionId, cmd)).trim() } catch { return '' }
}

/** df -Ph 解析真实磁盘（跳过虚拟文件系统） */
function parseDisks(raw: string): Array<{ device: string; mount: string; percent: number; used: string; size: string }> {
  const out: Array<{ device: string; mount: string; percent: number; used: string; size: string }> = []
  for (const line of raw.split('\n').slice(1)) {
    const p = line.trim().split(/\s+/)
    if (p.length < 6) continue
    const device = p[0]
    if (/^(tmpfs|devtmpfs|overlay|none|udev)/.test(device) || device.startsWith('/dev/loop')) continue
    out.push({ device, size: p[1], used: p[2], percent: parseInt(p[4]) || 0, mount: p[5] })
  }
  return out
}

/** free -b 解析内存/swap */
function parseMem(raw: string): { memPercent: number; memUsed: string; memTotal: string; swapPercent: number } {
  let memPercent = 0, swapPercent = 0, memUsed = '0', memTotal = '0'
  for (const line of raw.split('\n')) {
    const p = line.trim().split(/\s+/)
    if (line.startsWith('Mem:') && p.length >= 3) {
      const total = parseInt(p[1]) || 0, used = parseInt(p[2]) || 0
      memPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
      memUsed = fmtBytes(used); memTotal = fmtBytes(total)
    }
    if (line.startsWith('Swap:') && p.length >= 3) {
      const total = parseInt(p[1]) || 0, used = parseInt(p[2]) || 0
      swapPercent = total > 0 ? Math.round((used / total) * 1000) / 10 : 0
    }
  }
  return { memPercent, memUsed, memTotal, swapPercent }
}

function fmtBytes(b: number): string {
  if (b >= 1073741824) return (b / 1073741824).toFixed(1) + 'G'
  if (b >= 1048576) return (b / 1048576).toFixed(1) + 'M'
  if (b >= 1024) return (b / 1024).toFixed(1) + 'K'
  return b + 'B'
}

export const useInspectionStore = defineStore('inspection', () => {
  const running = ref(false)
  const report = ref<InspectionReport | null>(loadReport())

  const REPORT_KEY = 'ops-inspection-report'
  function loadReport(): InspectionReport | null {
    try { const s = localStorage.getItem(REPORT_KEY); if (s) return JSON.parse(s) } catch {}
    return null
  }
  function saveReport() { try { localStorage.setItem(REPORT_KEY, JSON.stringify(report.value)) } catch {} }

  /** 执行一次完整巡检 */
  async function runInspection(sessionId: string, serverName: string, serverId: string): Promise<InspectionReport> {
    running.value = true
    try {
      const raw: Record<string, string> = {}
      for (const [k, cmd] of Object.entries(INSPECT_CMDS)) raw[k] = await exec(sessionId, cmd)

      const findings: Finding[] = []
      const cores = parseInt(raw.nproc) || 1

      // ── 磁盘 ──
      const disks = parseDisks(raw.df)
      for (const d of disks) {
        if (d.percent >= 90) findings.push({ id: fid(), category: 'catDisk', severity: 'critical', title: `${d.mount} 磁盘空间严重不足`, detail: `${d.device} 已用 ${d.percent}%（${d.used}/${d.size}）`, value: d.percent + '%', suggestion: '清理日志/临时文件或扩容：du -sh /* | sort -rh | head' })
        else if (d.percent >= 80) findings.push({ id: fid(), category: 'catDisk', severity: 'warning', title: `${d.mount} 磁盘使用偏高`, detail: `${d.device} 已用 ${d.percent}%（${d.used}/${d.size}）`, value: d.percent + '%', suggestion: '关注增长趋势，提前清理' })
      }

      // ── 内存 ──
      const mem = parseMem(raw.mem)
      if (mem.memPercent >= 90) findings.push({ id: fid(), category: 'catMemory', severity: 'critical', title: '内存使用率过高', detail: `已用 ${mem.memPercent}%（${mem.memUsed}/${mem.memTotal}）`, value: mem.memPercent + '%', suggestion: '排查内存大户：ps aux --sort=-%mem | head' })
      else if (mem.memPercent >= 80) findings.push({ id: fid(), category: 'catMemory', severity: 'warning', title: '内存使用偏高', detail: `已用 ${mem.memPercent}%（${mem.memUsed}/${mem.memTotal}）`, value: mem.memPercent + '%' })
      if (mem.swapPercent >= 50) findings.push({ id: fid(), category: 'catMemory', severity: 'warning', title: 'Swap 使用较多', detail: `Swap 已用 ${mem.swapPercent}%`, value: mem.swapPercent + '%', suggestion: 'Swap 频繁使用通常意味物理内存不足' })

      // ── 负载 ──
      const load1 = parseFloat(raw.loadavg.split(/\s+/)[0]) || 0
      if (load1 > cores * 2) findings.push({ id: fid(), category: 'catCpu', severity: 'critical', title: '系统负载过高', detail: `1 分钟负载 ${load1.toFixed(2)}（${cores} 核）`, value: load1.toFixed(2), suggestion: '负载远超核心数，排查 CPU/IO 瓶颈：top、iostat -x 1 3' })
      else if (load1 > cores) findings.push({ id: fid(), category: 'catCpu', severity: 'warning', title: '系统负载偏高', detail: `1 分钟负载 ${load1.toFixed(2)}（${cores} 核）`, value: load1.toFixed(2) })

      // ── 失败服务 ──
      const failedLines = raw.failed.split('\n').map(l => l.trim()).filter(Boolean)
      for (const line of failedLines) {
        const svc = line.split(/\s+/)[0]
        if (svc) findings.push({ id: fid(), category: 'catService', severity: 'warning', title: `服务异常：${svc}`, detail: line, suggestion: `systemctl status ${svc} --no-pager 查看详情` })
      }

      // ── 僵尸进程 ──
      const zombies = parseInt(raw.zombies) || 0
      if (zombies > 0) findings.push({ id: fid(), category: 'catProcess', severity: 'warning', title: `存在 ${zombies} 个僵尸进程`, detail: '僵尸进程无法被回收，通常是父进程未正确 wait', value: String(zombies), suggestion: 'ps aux | awk \'$8~/Z/\' 定位其父进程' })

      // ── 近期重启 ──
      const uptimeSec = parseFloat(raw.uptime.split(/\s+/)[0]) || 0
      if (uptimeSec > 0 && uptimeSec < 600) findings.push({ id: fid(), category: 'catSystem', severity: 'info', title: '服务器近期刚重启', detail: `运行时间仅 ${Math.round(uptimeSec / 60)} 分钟`, suggestion: '确认是否为计划内重启' })

      // ── 健康分 ──
      const crit = findings.filter(f => f.severity === 'critical').length
      const warn = findings.filter(f => f.severity === 'warning').length
      const healthScore = Math.max(0, Math.min(100, 100 - crit * 20 - warn * 8))

      const rep: InspectionReport = {
        serverId, serverName, timestamp: Date.now(), healthScore, findings,
        raw: Object.entries(raw).map(([k, v]) => `### ${k}\n${v}`).join('\n\n'),
        aiSummary: '',
      }
      report.value = rep
      saveReport()
      return rep
    } finally {
      running.value = false
    }
  }

  /** 构建供 AI 分析的提示词 */
  function buildAiPrompt(rep: InspectionReport): string {
    const findingsText = rep.findings.length
      ? rep.findings.map(f => `- [${f.severity}] ${f.title}：${f.detail}`).join('\n')
      : '（规则引擎未发现明显问题）'
    return `以下是服务器「${rep.serverName}」的巡检结果，健康分 ${rep.healthScore}/100。\n\n## 规则检查发现\n${findingsText}\n\n## 原始采集数据\n\`\`\`\n${rep.raw.slice(0, 5000)}\n\`\`\`\n\n请作为资深运维专家，给出：\n1. 服务器整体状态评估；\n2. 按优先级排序的处置建议（先做什么）；\n3. 潜在风险与预防措施。用简洁中文分点回答。`
  }

  /** 导出 Markdown 报告 */
  function exportMarkdown(rep: InspectionReport): string {
    const lines: string[] = []
    lines.push(`# 巡检报告 — ${rep.serverName}`)
    lines.push(`- 时间：${new Date(rep.timestamp).toLocaleString()}`)
    lines.push(`- 健康分：${rep.healthScore}/100`)
    lines.push('')
    lines.push('## 检查发现')
    if (rep.findings.length === 0) lines.push('未发现明显问题。')
    for (const f of rep.findings) {
      lines.push(`### [${f.severity.toUpperCase()}] ${f.title}`)
      lines.push(f.detail)
      if (f.suggestion) lines.push(`> 建议：${f.suggestion}`)
      lines.push('')
    }
    if (rep.aiSummary) { lines.push('## AI 分析'); lines.push(rep.aiSummary) }
    return lines.join('\n')
  }

  return { running, report, runInspection, buildAiPrompt, exportMarkdown, saveReport }
})
