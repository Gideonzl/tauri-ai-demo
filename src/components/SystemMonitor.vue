/**
 * 服务器系统监控面板
 * Termius暗色主题 + SVG图表（无第三方依赖）
 * 数据来源：SSH exec 实时采集
 */
<template>
  <div class="system-monitor">
    <!-- 无连接/无数据状态 -->
    <div v-if="!hasSession" class="monitor-empty">
      <el-icon :size="36"><Connection /></el-icon>
      <p>{{ t('monitor.noServer') }}</p>
      <p class="sub">{{ t('monitor.connectHint') }}</p>
    </div>

    <div v-else-if="!store.hasData && store.loading" class="monitor-loading">
      <el-icon :size="28" class="spinning"><Loading /></el-icon>
      <p>{{ t('monitor.collecting') }}</p>
    </div>

    <template v-else-if="store.data">
      <div class="monitor-scroll">
        <!-- ====== 服务器信息栏 ====== -->
        <div class="info-bar">
          <div class="info-left">
            <span class="info-os">{{ store.data.info.os }}</span>
            <span class="info-sep">|</span>
            <span class="info-label">IP:</span>
            <span class="info-val">{{ store.data.info.ip }}</span>
            <span class="info-sep">|</span>
            <span class="info-label">Kernel:</span>
            <span class="info-val">{{ store.data.info.kernel }}</span>
          </div>
          <div class="info-right">
            <span class="info-time">{{ formatDate(store.data.timestamp) }}</span>
            <el-button size="small" text @click="doRefresh" :loading="store.loading">
              <el-icon :size="14"><Refresh /></el-icon>
            </el-button>
          </div>
        </div>

        <!-- ====== 4 概览卡片 ====== -->
        <div class="overview-cards">
          <div class="over-card">
            <el-icon :size="18"><Clock /></el-icon>
            <div class="card-text">
              <span class="card-label">{{ t('monitor.uptime') }}</span>
              <span class="card-val">{{ store.data.info.uptime }}</span>
            </div>
          </div>
          <div class="over-card">
            <el-icon :size="18"><Cpu /></el-icon>
            <div class="card-text">
              <span class="card-label">{{ t('monitor.cpuModel') }}</span>
              <span class="card-val">{{ store.data.info.cpuModel }}</span>
            </div>
          </div>
          <div class="over-card">
            <el-icon :size="18"><Grid /></el-icon>
            <div class="card-text">
              <span class="card-label">{{ t('monitor.cpuCores') }}</span>
              <span class="card-val">{{ store.data.info.cpuCores }} {{ t('monitor.cores') }}</span>
            </div>
          </div>
          <div class="over-card">
            <el-icon :size="18"><Coin /></el-icon>
            <div class="card-text">
              <span class="card-label">{{ t('monitor.totalMemory') }}</span>
              <span class="card-val">{{ store.data.info.memoryTotal }}</span>
            </div>
          </div>
        </div>

        <!-- ====== CPU + Memory 双栏 ====== -->
        <div class="metrics-row">
          <!-- CPU 圆环图 -->
          <div class="metric-panel">
            <div class="panel-title">{{ t('monitor.cpuUsage') }}</div>
            <div class="cpu-ring-wrap">
              <svg viewBox="0 0 120 120" class="cpu-ring">
                <circle cx="60" cy="60" r="52" fill="none" stroke="var(--ring-bg)" stroke-width="8" />
                <circle cx="60" cy="60" r="52" fill="none"
                  :stroke="cpuGradient"
                  stroke-width="8"
                  stroke-linecap="round"
                  :stroke-dasharray="cpuDasharray"
                  :stroke-dashoffset="0"
                  transform="rotate(-90 60 60)"
                  class="cpu-ring-fill" />
                <text x="60" y="54" text-anchor="middle" class="ring-pct">{{ store.data.cpu.usagePercent }}%</text>
                <text x="60" y="72" text-anchor="middle" class="ring-label">CPU</text>
              </svg>
              <div class="cpu-details">
                <div class="cpu-line"><span class="clabel">user</span><span class="cval">{{ store.data.cpu.user }}%</span></div>
                <div class="cpu-line"><span class="clabel">system</span><span class="cval">{{ store.data.cpu.system }}%</span></div>
                <div class="cpu-line"><span class="clabel">idle</span><span class="cval">{{ store.data.cpu.idle }}%</span></div>
                <div class="cpu-line"><span class="clabel">iowait</span><span class="cval">{{ store.data.cpu.iowait }}%</span></div>
              </div>
            </div>
            <!-- CPU mini sparkline -->
            <svg viewBox="0 0 200 36" class="mini-sparkline">
              <polyline :points="cpuSparkPoints" fill="none" stroke="#5b9bd5" stroke-width="1.5" />
            </svg>
          </div>

          <!-- 内存横向条形图 -->
          <div class="metric-panel">
            <div class="panel-title">{{ t('monitor.memoryUsage') }}</div>
            <div class="mem-main">
              <span class="mem-used">{{ store.data.memory.used }}</span>
              <span class="mem-sep">/</span>
              <span class="mem-total">{{ store.data.memory.total }}</span>
              <span class="mem-pct">({{ store.data.memory.percent }}%)</span>
            </div>
            <!-- 内存条形图 -->
            <div class="mem-bar-wrap">
              <div class="mem-bar">
                <div class="mem-bar-fill" :style="{ width: store.data.memory.percent + '%' }"></div>
              </div>
            </div>
            <div class="mem-breakdown">
              <div class="mem-bitem">
                <span class="bdot" style="background:#5b9bd5"></span>
                <span class="blabel">Used</span>
                <span class="bval">{{ store.data.memory.used }}</span>
              </div>
              <div class="mem-bitem">
                <span class="bdot" style="background:#4caf7d"></span>
                <span class="blabel">Buff/Cache</span>
                <span class="bval">{{ store.data.memory.buffersCache }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ====== Disk I/O + Network 双栏 ====== -->
        <div class="metrics-row">
          <!-- Disk I/O -->
          <div class="metric-panel">
            <div class="panel-title">{{ t('monitor.diskIo') }}</div>
            <div class="io-stats">
              <div class="io-item">
                <span class="io-label">{{ t('monitor.read') }}</span>
                <span class="io-val read">{{ store.data.diskIo.readMBps.toFixed(1) }} MB/s</span>
              </div>
              <div class="io-item">
                <span class="io-label">{{ t('monitor.write') }}</span>
                <span class="io-val write">{{ store.data.diskIo.writeMBps.toFixed(1) }} MB/s</span>
              </div>
            </div>
            <svg viewBox="0 0 200 36" class="mini-sparkline">
              <polyline :points="diskReadSparkPoints" fill="none" stroke="#5b9bd5" stroke-width="1.5" />
              <polyline :points="diskWriteSparkPoints" fill="none" stroke="#e69138" stroke-width="1.5" />
            </svg>
            <div class="spark-legend">
              <span class="sdot" style="background:#5b9bd5"></span>Read
              <span class="sdot" style="background:#e69138;margin-left:8px"></span>Write
            </div>
          </div>

          <!-- Network I/O -->
          <div class="metric-panel">
            <div class="panel-title">{{ t('monitor.networkIo') }}</div>
            <div class="io-stats">
              <div class="io-item">
                <span class="io-label">RX ↓</span>
                <span class="io-val read">{{ store.data.network.rxMBps.toFixed(2) }} MB/s</span>
              </div>
              <div class="io-item">
                <span class="io-label">TX ↑</span>
                <span class="io-val write">{{ store.data.network.txMBps.toFixed(2) }} MB/s</span>
              </div>
            </div>
            <svg viewBox="0 0 200 36" class="mini-sparkline">
              <polyline :points="netRxSparkPoints" fill="none" stroke="#5b9bd5" stroke-width="1.5" />
              <polyline :points="netTxSparkPoints" fill="none" stroke="#6bc76b" stroke-width="1.5" />
            </svg>
            <div class="spark-legend">
              <span class="sdot" style="background:#5b9bd5"></span>RX
              <span class="sdot" style="background:#6bc76b;margin-left:8px"></span>TX
            </div>
          </div>
        </div>

        <!-- ====== 磁盘使用 ====== -->
        <div class="metric-panel disk-panel">
          <div class="panel-title">{{ t('monitor.diskUsage') }}</div>
          <div class="disk-list">
            <div v-for="d in store.data.disks" :key="d.device" class="disk-row">
              <div class="disk-info">
                <span class="disk-dev">{{ d.device }}</span>
                <span class="disk-mount">{{ d.mount }}</span>
              </div>
              <div class="disk-bar-wrap">
                <div class="disk-bar">
                  <div class="disk-bar-fill" :style="{ width: d.percent + '%' }"
                    :class="{ warn: d.percent > 80, danger: d.percent > 90 }"></div>
                </div>
              </div>
              <div class="disk-details">
                <span class="disk-used">{{ d.used }} / {{ d.size }}</span>
                <span class="disk-pct" :class="{ warn: d.percent > 80, danger: d.percent > 90 }">{{ d.percent }}%</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ====== 进程列表 ====== -->
        <div class="metric-panel proc-panel">
          <div class="panel-title">{{ t('monitor.runningProcesses') }}</div>
          <div class="proc-table-wrap">
            <table class="proc-table">
              <thead>
                <tr>
                  <th>NAME</th>
                  <th>PID</th>
                  <th>CPU%</th>
                  <th>MEM%</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in store.data.processes" :key="p.pid">
                  <td class="proc-name">{{ p.name }}</td>
                  <td class="mono">{{ p.pid }}</td>
                  <td class="mono" :class="{ warn: p.cpu > 50 }">{{ p.cpu.toFixed(1) }}</td>
                  <td class="mono" :class="{ warn: p.mem > 10 }">{{ p.mem.toFixed(1) }}</td>
                  <td><span class="proc-status" :class="statusClass(p.status)">{{ p.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 底部状态栏 -->
      <div class="monitor-status-bar">
        <span class="status-dot" :class="{ connected: store.hasData }"></span>
        {{ store.hasData ? t('monitor.live') : t('monitor.idle') }}
        <span v-if="refreshActive" style="margin-left:8px;color:var(--color-text-muted)">Auto {{ refreshIntervalSec }}s</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { Connection, Loading, Refresh, Clock, Cpu, Grid, Coin } from '@element-plus/icons-vue'

const store = useMonitorStore()
const sshStore = useSshStore()
const { t, locale } = useLocale()

const refreshActive = ref(false)
const refreshIntervalSec = 5
let _timer: ReturnType<typeof setInterval> | null = null

/** Whether we have a real SSH session */
const hasSession = computed(() => {
  const s = sshStore.activeSession
  return !!(s && s.realSessionId && s.status === 'connected')
})

/** Server identity */
const serverInfo = computed(() => {
  const s = sshStore.activeSession
  if (!s) return { name: '', host: '' }
  const svr = sshStore.servers.find((x: { id: string }) => x.id === s.serverId)
  return { name: s.serverName, host: svr?.host || '' }
})

// CPU donut chart
const cpuDasharray = computed(() => {
  const pct = store.data?.cpu.usagePercent || 0
  const c = 2 * Math.PI * 52 // circumference ~326.7
  const filled = (pct / 100) * c
  return `${filled} ${c - filled}`
})

const cpuGradient = computed(() => {
  const pct = store.data?.cpu.usagePercent || 0
  if (pct > 80) return '#e05555'
  if (pct > 50) return '#e69138'
  return '#5b9bd5'
})

// Sparkline point generators
function sparkPoints(values: number[], maxVal: number, w = 200, h = 36): string {
  if (!values.length) return ''
  const n = values.length
  const stepX = w / Math.max(n - 1, 1)
  const clamped = maxVal > 0 ? maxVal : 1
  return values.map((v, i) => {
    const x = i * stepX
    const y = h - (v / clamped) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')
}

const cpuSparkPoints = computed(() => sparkPoints(store.data?.cpu.history || [], 100))
const diskReadSparkPoints = computed(() => sparkPoints(store.data?.diskIo.readHistory || [], Math.max(...(store.data?.diskIo.readHistory || [1]), 1)))
const diskWriteSparkPoints = computed(() => sparkPoints(store.data?.diskIo.writeHistory || [], Math.max(...(store.data?.diskIo.writeHistory || [1]), 1)))
const netRxSparkPoints = computed(() => sparkPoints(store.data?.network.rxHistory || [], Math.max(...(store.data?.network.rxHistory || [1]), 1)))
const netTxSparkPoints = computed(() => sparkPoints(store.data?.network.txHistory || [], Math.max(...(store.data?.network.txHistory || [1]), 1)))

function formatDate(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleTimeString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function statusClass(status: string): string {
  switch (status.toUpperCase()) {
    case 'R': return 'running'
    case 'S': case 'I': return 'sleeping'
    case 'D': return 'blocked'
    case 'Z': return 'zombie'
    case 'T': return 'stopped'
    default: return ''
  }
}

async function doRefresh() {
  if (!hasSession.value) return
  const s = sshStore.activeSession!
  const svr = sshStore.servers.find((x: { id: string }) => x.id === s.serverId)
  await store.refresh(s.realSessionId!, svr?.name || s.serverName, svr?.host || '')
}

/** Start/stop auto refresh */
function startRefresh() {
  if (!hasSession.value || refreshActive.value) return
  refreshActive.value = true
  const s = sshStore.activeSession!
  const svr = sshStore.servers.find((x: { id: string }) => x.id === s.serverId)
  store.startAutoRefresh(s.realSessionId!, svr?.name || s.serverName, svr?.host || '', refreshIntervalSec * 1000)
}

function stopRefresh() {
  refreshActive.value = false
  store.stopAutoRefresh()
}

/** Watch for session changes — auto start/stop */
watch(hasSession, (active) => {
  if (active) {
    startRefresh()
  } else {
    stopRefresh()
  }
}, { immediate: true })

onUnmounted(() => stopRefresh())
</script>

<style lang="scss" scoped>
// CSS custom properties for ring chart
.system-monitor {
  --ring-bg: rgba(255, 255, 255, 0.08);
  --color-text-muted: #5e5e6e;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.monitor-empty, .monitor-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #6e6e7e;
  p { margin: 0; font-size: 13px; }
  .sub { font-size: 11px; color: #4e4e5e; }
}

.spinning { animation: spin 1.2s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.monitor-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding-bottom: 4px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
}

// ====== Info Bar ======
.info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(91, 155, 213, 0.06);
  border-bottom: 1px solid rgba(91, 155, 213, 0.1);
  font-family: 'JetBrains Mono', 'Cascadia Code', monospace;
  font-size: 10px;
  color: #8e8e9e;
  flex-shrink: 0;

  .info-left { display: flex; align-items: center; gap: 6px; overflow: hidden; }
  .info-os { color: #c0c0d0; font-weight: 600; white-space: nowrap; }
  .info-sep { color: #3e3e4e; }
  .info-label { color: #6e6e7e; }
  .info-val { color: #aeaeb8; }
  .info-time { color: #5e5e6e; }
  .info-right { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
}

// ====== Overview Cards ======
.overview-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 8px 10px;
}

.over-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 4px;
  color: #6e6e7e;

  .card-text { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
  .card-label { font-size: 9px; color: #5e5e6e; text-transform: uppercase; letter-spacing: 0.4px; }
  .card-val { font-size: 11px; color: #c0c0d0; font-family: 'JetBrains Mono', monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}

// ====== Metrics Rows ======
.metrics-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 10px 6px;
}

.metric-panel {
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.04);
  border-radius: 4px;
  padding: 10px;
}

.panel-title {
  font-size: 10px;
  font-weight: 600;
  color: #8e8eae;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
}

// ====== CPU Ring ======
.cpu-ring-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  justify-content: center;
}

.cpu-ring {
  width: 80px;
  height: 80px;
  flex-shrink: 0;

  .ring-pct { font-size: 18px; font-weight: 700; fill: #e0e0f0; font-family: 'JetBrains Mono', monospace; }
  .ring-label { font-size: 8px; fill: #6e6e7e; }
}

.cpu-ring-fill { transition: stroke-dasharray 0.6s ease; }

.cpu-details {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  font-family: 'JetBrains Mono', monospace;
}

.cpu-line { display: flex; gap: 8px; }
.clabel { color: #6e6e7e; width: 40px; text-align: right; }
.cval { color: #c0c0d0; }

// ====== Memory ======
.mem-main {
  text-align: center;
  margin-bottom: 6px;
  font-family: 'JetBrains Mono', monospace;
}
.mem-used { font-size: 20px; font-weight: 700; color: #e0e0f0; }
.mem-sep { color: #5e5e6e; margin: 0 2px; }
.mem-total { font-size: 13px; color: #8e8e9e; }
.mem-pct { font-size: 11px; color: #5b9bd5; margin-left: 6px; }

.mem-bar-wrap { padding: 0 4px; }
.mem-bar { height: 8px; background: rgba(255,255,255,0.06); border-radius: 4px; overflow: hidden; }
.mem-bar-fill { height: 100%; background: linear-gradient(90deg, #5b9bd5, #4a8bc5); border-radius: 4px; transition: width 0.6s ease; }

.mem-breakdown { display: flex; flex-direction: column; gap: 3px; margin-top: 8px; font-size: 10px; }
.mem-bitem { display: flex; align-items: center; gap: 6px; }
.bdot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.blabel { color: #6e6e7e; flex: 1; }
.bval { color: #c0c0d0; font-family: 'JetBrains Mono', monospace; }

// ====== I/O Stats ======
.io-stats {
  display: flex;
  justify-content: space-around;
  margin-bottom: 6px;
}

.io-item { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.io-label { font-size: 9px; color: #6e6e7e; text-transform: uppercase; }
.io-val { font-size: 12px; font-family: 'JetBrains Mono', monospace; font-weight: 600;
  &.read { color: #5b9bd5; }
  &.write { color: #e69138; }
}

.mini-sparkline {
  width: 100%;
  height: 36px;
  display: block;
}

.spark-legend {
  display: flex;
  align-items: center;
  font-size: 9px;
  color: #6e6e7e;
  margin-top: 2px;
}

.sdot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-right: 4px;
}

// ====== Disk Usage ======
.disk-panel {
  margin: 0 10px 6px;
}

.disk-list { display: flex; flex-direction: column; gap: 6px; }

.disk-row {
  display: grid;
  grid-template-columns: 90px 1fr 80px;
  align-items: center;
  gap: 8px;
}

.disk-info { display: flex; flex-direction: column; gap: 1px; }
.disk-dev { font-size: 11px; color: #c0c0d0; font-family: 'JetBrains Mono', monospace; }
.disk-mount { font-size: 9px; color: #5e5e6e; }

.disk-bar-wrap { }
.disk-bar { height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; }
.disk-bar-fill {
  height: 100%;
  background: #5b9bd5;
  border-radius: 3px;
  transition: width 0.6s ease;
  &.warn { background: #e69138; }
  &.danger { background: #e05555; }
}

.disk-details { display: flex; justify-content: space-between; font-size: 9px; font-family: 'JetBrains Mono', monospace; }
.disk-used { color: #8e8e9e; }
.disk-pct { color: #6e6e7e; font-weight: 600;
  &.warn { color: #e69138; }
  &.danger { color: #e05555; }
}

// ====== Process Table ======
.proc-panel {
  margin: 0 10px 6px;
}

.proc-table-wrap { max-height: 260px; overflow-y: auto; }

.proc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;

  th {
    text-align: left;
    padding: 4px 6px;
    color: #5e5e6e;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    position: sticky;
    top: 0;
    background: #14141e;
  }

  td {
    padding: 3px 6px;
    color: #aeaeb8;
    border-bottom: 1px solid rgba(255,255,255,0.02);
  }

  tr:hover td { background: rgba(255,255,255,0.02); }

  .proc-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .mono { font-family: 'JetBrains Mono', monospace; }
  .warn { color: #e69138; }
}

.proc-status {
  font-size: 8px;
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.3px;
  &.running { color: #4caf7d; background: rgba(76,175,125,0.12); }
  &.sleeping { color: #6e6e7e; background: rgba(255,255,255,0.04); }
  &.blocked { color: #e69138; background: rgba(230,145,56,0.12); }
  &.zombie { color: #e05555; background: rgba(224,85,85,0.15); }
  &.stopped { color: #d4a24e; background: rgba(212,162,78,0.12); }
}

// ====== Status Bar ======
.monitor-status-bar {
  display: flex;
  align-items: center;
  padding: 4px 10px;
  border-top: 1px solid rgba(255,255,255,0.04);
  font-size: 10px;
  color: #6e6e7e;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
  background: rgba(0,0,0,0.1);

  .status-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: #5e5e6e; margin-right: 6px;
    &.connected { background: #4caf7d; }
  }
}
</style>
