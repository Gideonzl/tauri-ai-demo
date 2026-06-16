/**
 * 服务器监控状态管理
 * 通过 SSH exec 获取远程服务器系统指标，支持自动刷新
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { sshExec } from '@/api/tauri'

// ============================================================
// 类型定义
// ============================================================

export interface SystemInfo {
  hostname: string
  os: string
  kernel: string
  ip: string
  uptime: string       // e.g. "45d 12h"
  uptimeSeconds: number
  cpuModel: string
  cpuCores: number
  memoryTotal: string   // e.g. "7.8 GiB"
  memoryTotalBytes: number
}

export interface CpuMetrics {
  usagePercent: number
  user: number
  system: number
  idle: number
  iowait: number
  history: number[]     // last N data points for chart
}

export interface MemoryMetrics {
  used: string          // e.g. "3.3 GiB"
  usedBytes: number
  total: string         // e.g. "7.8 GiB"
  totalBytes: number
  percent: number
  buffersCache: string
  buffersCacheBytes: number
}

export interface DiskIoMetrics {
  readMBps: number
  writeMBps: number
  readHistory: number[]
  writeHistory: number[]
}

export interface NetworkMetrics {
  rxMBps: number
  txMBps: number
  rxHistory: number[]
  txHistory: number[]
}

export interface DiskUsage {
  device: string
  mount: string
  size: string
  used: string
  avail: string
  percent: number
}

export interface ProcessInfo {
  pid: number
  name: string
  cpu: number
  mem: number
  status: string
}

export interface MonitorData {
  info: SystemInfo
  cpu: CpuMetrics
  memory: MemoryMetrics
  diskIo: DiskIoMetrics
  network: NetworkMetrics
  disks: DiskUsage[]
  processes: ProcessInfo[]
  timestamp: number
}

// ============================================================
// 命令执行与解析
// ============================================================

/** 执行一条SSH命令（无超时处理交由调用方） */
async function exec(sessionId: string, cmd: string): Promise<string> {
  try {
    const out = await sshExec(sessionId, cmd)
    return out.trim()
  } catch {
    return ''
  }
}

/** 批量执行多条命令 */
async function execBatch(sessionId: string, cmds: Record<string, string>): Promise<Record<string, string>> {
  const results: Record<string, string> = {}
  for (const [key, cmd] of Object.entries(cmds)) {
    results[key] = await exec(sessionId, cmd)
  }
  return results
}

/** 解析 /proc/uptime → seconds */
function parseUptime(raw: string): number {
  const m = raw.match(/^([\d.]+)/)
  return m ? parseFloat(m[1]) : 0
}

/** 格式化秒数 → "45d 12h" */
function formatUptime(secs: number): string {
  const d = Math.floor(secs / 86400)
  const h = Math.floor((secs % 86400) / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** 解析 /proc/cpuinfo → model name */
function parseCpuModel(raw: string): string {
  const m = raw.match(/model name\s*:\s*(.+)/i)
  return m ? m[1].trim().replace(/\s+/g, ' ') : 'Unknown'
}

/** 解析 /proc/meminfo → 返回总内存(bytes) */
function parseMemTotal(raw: string): number {
  const m = raw.match(/MemTotal:\s*(\d+)\s*kB/i)
  return m ? parseInt(m[1]) * 1024 : 0
}

/** 解析 top -bn1 CPU行 → CpuMetrics */
function parseCpuUsage(raw: string, prevHistory: number[]): CpuMetrics {
  // top -bn1 | grep "Cpu(s)" → "%Cpu(s):  8.2 us,  2.1 sy,  0.0 ni, 89.1 id,  0.1 wa,  0.0 hi,  0.5 si,  0.0 st"
  const m = raw.match(/([\d.]+)\s*us.*?([\d.]+)\s*sy.*?([\d.]+)\s*ni.*?([\d.]+)\s*id.*?([\d.]+)\s*wa/)
  if (!m) {
    return { usagePercent: 0, user: 0, system: 0, idle: 100, iowait: 0, history: [] }
  }
  const user = parseFloat(m[1])
  const system = parseFloat(m[2])
  const idle = parseFloat(m[4])
  const iowait = parseFloat(m[5])
  const usage = Math.round((user + system) * 10) / 10
  const history = [...prevHistory, usage].slice(-30) // keep last 30 points
  return { usagePercent: usage, user, system, idle, iowait, history }
}

/** 解析 free -b → MemoryMetrics */
function parseMemory(raw: string, totalBytes: number, prevCache: number): MemoryMetrics {
  // free -b output:
  //                total        used        free      shared  buff/cache   available
  // Mem:       8147488768  3460300800  1234567890   98765432  3456789012  4012345678
  const lines = raw.split('\n')
  const memLine = lines.find(l => l.startsWith('Mem:'))
  if (!memLine) {
    return { used: '0', usedBytes: 0, total: '0', totalBytes: 0, percent: 0, buffersCache: '0', buffersCacheBytes: 0 }
  }
  const parts = memLine.trim().split(/\s+/)
  const usedB = parseInt(parts[2]) || 0
  const buffCacheB = parseInt(parts[5]) || 0
  const percent = totalBytes > 0 ? Math.round((usedB / totalBytes) * 1000) / 10 : 0
  return {
    used: formatBytes(usedB),
    usedBytes: usedB,
    total: formatBytes(totalBytes),
    totalBytes,
    percent,
    buffersCache: formatBytes(buffCacheB),
    buffersCacheBytes: buffCacheB,
  }
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' GiB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MiB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KiB'
  return bytes + ' B'
}

/** 解析 df -h → DiskUsage[] */
function parseDiskUsage(raw: string): DiskUsage[] {
  const lines = raw.split('\n').slice(1)
  const disks: DiskUsage[] = []
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 6) continue
    const device = parts[0]
    // filter out tmpfs, devtmpfs, overlay, etc.
    if (device.startsWith('tmpfs') || device.startsWith('devtmpfs') || device.startsWith('overlay') || device === 'none') continue
    if (device.startsWith('/dev/loop')) continue
    disks.push({
      device,
      size: parts[1],
      used: parts[2],
      avail: parts[3],
      percent: parseInt(parts[4].replace('%', '')) || 0,
      mount: parts[5],
    })
  }
  return disks
}

/** 解析 ps aux → ProcessInfo[] */
function parseProcesses(raw: string): ProcessInfo[] {
  const lines = raw.split('\n').slice(1)
  const procs: ProcessInfo[] = []
  for (const line of lines) {
    const parts = line.trim().split(/\s+/, 11)
    if (parts.length < 11) continue
    procs.push({
      pid: parseInt(parts[1]) || 0,
      name: parts[10]?.split('/').pop() || parts[10] || '',
      cpu: parseFloat(parts[2]) || 0,
      mem: parseFloat(parts[3]) || 0,
      status: parts[7] || '?',
    })
  }
  return procs
}

/** 解析 /proc/diskstats → { readMB, writeMB } (自系统启动以来的累计值) */
function parseDiskStats(raw: string): { readMB: number; writeMB: number } {
  let totalRead = 0, totalWrite = 0
  for (const line of raw.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 14) continue
    // field 5: sectors read, field 9: sectors written (512 bytes each)
    totalRead += (parseInt(parts[5]) || 0) * 512
    totalWrite += (parseInt(parts[9]) || 0) * 512
  }
  return { readMB: totalRead / 1048576, writeMB: totalWrite / 1048576 }
}

/** 解析 /proc/net/dev → { rxMB, txMB } */
function parseNetDev(raw: string): { rxMB: number; txMB: number } {
  let totalRx = 0, totalTx = 0
  const lines = raw.split('\n').slice(2) // skip headers
  for (const line of lines) {
    const parts = line.trim().split(/\s+/)
    if (parts.length < 10) continue
    const iface = parts[0].replace(':', '')
    if (iface === 'lo') continue // skip loopback
    totalRx += (parseInt(parts[1]) || 0)
    totalTx += (parseInt(parts[9]) || 0)
  }
  return { rxMB: totalRx / 1048576, txMB: totalTx / 1048576 }
}

// ============================================================
// Store
// ============================================================

export const useMonitorStore = defineStore('monitor', () => {
  const data = ref<MonitorData | null>(null)
  const loading = ref(false)
  const error = ref('')
  const lastSessionId = ref('')
  const refreshInterval = ref<ReturnType<typeof setInterval> | null>(null)

  // 前一次 I/O 累计值（用于计算速率）
  let prevDiskStats: { readMB: number; writeMB: number; ts: number } | null = null
  let prevNetStats: { rxMB: number; txMB: number; ts: number } | null = null

  /** 执行完整的数据采集 */
  async function fetchData(sessionId: string, serverName: string, serverHost: string) {
    if (!sessionId) return
    lastSessionId.value = sessionId
    loading.value = true
    error.value = ''

    try {
      const raw = await execBatch(sessionId, {
        hostname: 'hostname',
        os: 'cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d= -f2 | tr -d \'"\'',
        kernel: 'uname -r',
        uptime: 'cat /proc/uptime',
        cpuInfo: 'cat /proc/cpuinfo | grep "model name" | head -1',
        nproc: 'nproc',
        memTotal: 'cat /proc/meminfo | grep MemTotal',
        cpuUsage: 'top -bn1 2>/dev/null | grep "Cpu(s)"',
        free: 'free -b 2>/dev/null',
        df: 'df -h 2>/dev/null',
        ps: 'ps aux --sort=-%cpu 2>/dev/null | head -25',
        diskstats: 'cat /proc/diskstats 2>/dev/null',
        netdev: 'cat /proc/net/dev 2>/dev/null',
      })

      const uptimeSecs = parseUptime(raw.uptime)
      const memTotalBytes = parseMemTotal(raw.memTotal)

      // System info
      const info: SystemInfo = {
        hostname: raw.hostname || serverName,
        os: raw.os || 'Linux',
        kernel: raw.kernel || 'Unknown',
        ip: serverHost,
        uptime: formatUptime(uptimeSecs),
        uptimeSeconds: uptimeSecs,
        cpuModel: parseCpuModel(raw.cpuInfo),
        cpuCores: parseInt(raw.nproc) || 0,
        memoryTotal: formatBytes(memTotalBytes),
        memoryTotalBytes: memTotalBytes,
      }

      // CPU
      const cpuHistory = data.value?.cpu.history || []
      const cpu = parseCpuUsage(raw.cpuUsage, cpuHistory)

      // Memory
      const prevCache = data.value?.memory.buffersCacheBytes || 0
      const memory = parseMemory(raw.free, memTotalBytes, prevCache)

      // Disk I/O (rate calculation between polls)
      const currDisk = parseDiskStats(raw.diskstats)
      const now = Date.now()
      let diskIo: DiskIoMetrics = {
        readMBps: data.value?.diskIo.readMBps || 0,
        writeMBps: data.value?.diskIo.writeMBps || 0,
        readHistory: data.value?.diskIo.readHistory || [],
        writeHistory: data.value?.diskIo.writeHistory || [],
      }
      if (prevDiskStats) {
        const dt = (now - prevDiskStats.ts) / 1000
        if (dt > 0) {
          const readMBps = Math.round(((currDisk.readMB - prevDiskStats.readMB) / dt) * 100) / 100
          const writeMBps = Math.round(((currDisk.writeMB - prevDiskStats.writeMB) / dt) * 100) / 100
          diskIo = {
            readMBps: Math.max(0, readMBps),
            writeMBps: Math.max(0, writeMBps),
            readHistory: [...diskIo.readHistory, readMBps].slice(-30),
            writeHistory: [...diskIo.writeHistory, writeMBps].slice(-30),
          }
        }
      }
      prevDiskStats = { ...currDisk, ts: now }

      // Network
      const currNet = parseNetDev(raw.netdev)
      let network: NetworkMetrics = {
        rxMBps: data.value?.network.rxMBps || 0,
        txMBps: data.value?.network.txMBps || 0,
        rxHistory: data.value?.network.rxHistory || [],
        txHistory: data.value?.network.txHistory || [],
      }
      if (prevNetStats) {
        const dt = (now - prevNetStats.ts) / 1000
        if (dt > 0) {
          const rxMBps = Math.round(((currNet.rxMB - prevNetStats.rxMB) / dt) * 100) / 100
          const txMBps = Math.round(((currNet.txMB - prevNetStats.txMB) / dt) * 100) / 100
          network = {
            rxMBps: Math.max(0, rxMBps),
            txMBps: Math.max(0, txMBps),
            rxHistory: [...network.rxHistory, rxMBps].slice(-30),
            txHistory: [...network.txHistory, txMBps].slice(-30),
          }
        }
      }
      prevNetStats = { ...currNet, ts: now }

      // Disks
      const disks = parseDiskUsage(raw.df)

      // Processes
      const processes = parseProcesses(raw.ps)

      data.value = {
        info, cpu, memory, diskIo, network, disks, processes,
        timestamp: now,
      }
    } catch (e: any) {
      error.value = e?.message || String(e)
    } finally {
      loading.value = false
    }
  }

  /** 开始自动刷新 (默认每5秒) */
  function startAutoRefresh(sessionId: string, serverName: string, serverHost: string, intervalMs = 5000) {
    stopAutoRefresh()
    fetchData(sessionId, serverName, serverHost)
    refreshInterval.value = setInterval(() => {
      fetchData(sessionId, serverName, serverHost)
    }, intervalMs)
  }

  /** 停止自动刷新 */
  function stopAutoRefresh() {
    if (refreshInterval.value) {
      clearInterval(refreshInterval.value)
      refreshInterval.value = null
    }
    prevDiskStats = null
    prevNetStats = null
  }

  /** 手动刷新 */
  function refresh(sessionId: string, serverName: string, serverHost: string) {
    return fetchData(sessionId, serverName, serverHost)
  }

  /** 是否有真实数据 */
  const hasData = computed(() => data.value !== null)

  return {
    data, loading, error, hasData,
    fetchData, startAutoRefresh, stopAutoRefresh, refresh,
  }
})
