<!-- SystemMonitor — optimized typography, layout, responsive sizing -->
<template>
  <div class="system-monitor" @contextmenu.prevent="onCtx">
    <!-- No session -->
    <div v-if="!hasSession" class="monitor-empty">
      <div class="empty-icon-wrap">
        <el-icon :size="32"><Connection /></el-icon>
      </div>
      <p class="empty-title">{{ t('monitor.noServer') }}</p>
      <p class="empty-sub">{{ t('monitor.connectHint') }}</p>
    </div>

    <!-- Loading -->
    <div v-else-if="!store.hasData && store.loading" class="monitor-loading">
      <el-icon :size="24" class="spinning"><Loading /></el-icon>
      <p class="loading-text">{{ t('monitor.collecting') }}</p>
    </div>

    <template v-else-if="store.data">
      <div class="monitor-scroll">
        <!-- ═══ Info bar ═══ -->
        <div class="info-bar">
          <div class="info-left">
            <span class="info-os">{{ store.data.info.os }}</span>
            <span class="info-sep">·</span>
            <span class="info-label">IP</span>
            <span class="info-val">{{ store.data.info.ip }}</span>
            <span class="info-sep">·</span>
            <span class="info-label">Kernel</span>
            <span class="info-val">{{ store.data.info.kernel }}</span>
          </div>
          <div class="info-right">
            <span class="info-time">{{ formatDate(store.data.timestamp) }}</span>
            <el-button size="small" text @click="doRefresh" :loading="store.loading">
              <el-icon :size="13"><Refresh /></el-icon>
            </el-button>
          </div>
        </div>

        <!-- ═══ Overview cards — 2-col auto-fit ═══ -->
        <div class="overview-cards">
          <div class="over-card">
            <div class="card-icon"><el-icon :size="16"><Clock /></el-icon></div>
            <div class="card-body">
              <span class="card-label">{{ t('monitor.uptime') }}</span>
              <span class="card-val">{{ store.data.info.uptime }}</span>
            </div>
          </div>
          <div class="over-card">
            <div class="card-icon"><el-icon :size="16"><Cpu /></el-icon></div>
            <div class="card-body">
              <span class="card-label">{{ t('monitor.cpuModel') }}</span>
              <span class="card-val">{{ store.data.info.cpuModel }}</span>
            </div>
          </div>
          <div class="over-card">
            <div class="card-icon"><el-icon :size="16"><Grid /></el-icon></div>
            <div class="card-body">
              <span class="card-label">{{ t('monitor.cpuCores') }}</span>
              <span class="card-val">{{ store.data.info.cpuCores }} {{ t('monitor.cores') }}</span>
            </div>
          </div>
          <div class="over-card">
            <div class="card-icon"><el-icon :size="16"><Coin /></el-icon></div>
            <div class="card-body">
              <span class="card-label">{{ t('monitor.totalMemory') }}</span>
              <span class="card-val">{{ store.data.info.memoryTotal }}</span>
            </div>
          </div>
        </div>

        <!-- ═══ CPU full-width ═══ -->
        <div class="metric-panel">
          <div class="panel-header">
            <span class="panel-dot" :style="{ background: cpuGradient }"></span>
            <span class="panel-title">{{ t('monitor.cpuUsage') }}</span>
            <span class="panel-badge" :class="cpuLoadClass">{{ store.data.cpu.usagePercent }}%</span>
          </div>
          <div class="cpu-ring-wrap">
            <svg viewBox="0 0 120 120" class="cpu-ring">
              <circle cx="60" cy="60" r="50" fill="none" stroke="var(--ring-bg)" stroke-width="7" />
              <circle cx="60" cy="60" r="50" fill="none"
                :stroke="cpuGradient" stroke-width="7" stroke-linecap="round"
                :stroke-dasharray="cpuDasharray" :stroke-dashoffset="0"
                transform="rotate(-90 60 60)" class="cpu-ring-fill" />
              <text x="60" y="54" text-anchor="middle" class="ring-pct">{{ store.data.cpu.usagePercent }}%</text>
              <text x="60" y="70" text-anchor="middle" class="ring-label">CPU</text>
            </svg>
            <div class="cpu-details">
              <div class="cpu-line"><span class="clabel">user</span><span class="cval">{{ store.data.cpu.user }}%</span></div>
              <div class="cpu-line"><span class="clabel">system</span><span class="cval">{{ store.data.cpu.system }}%</span></div>
              <div class="cpu-line"><span class="clabel">iowait</span><span class="cval">{{ store.data.cpu.iowait }}%</span></div>
              <div class="cpu-line"><span class="clabel">idle</span><span class="cval idle-val">{{ store.data.cpu.idle }}%</span></div>
            </div>
          </div>
          <svg viewBox="0 0 300 40" class="mini-sparkline">
            <polygon :points="cpuSparkFillWide" :style="{ fill: cpuGradient }" opacity="0.12" />
            <polyline :points="cpuSparkPointsWide" fill="none" :style="{ stroke: cpuGradient }" stroke-width="1.5" />
          </svg>
        </div>

        <!-- ═══ Memory full-width ═══ -->
        <div class="metric-panel">
          <div class="panel-header">
            <span class="panel-dot" :style="{ background: 'var(--chart-cpu-normal)' }"></span>
            <span class="panel-title">{{ t('monitor.memoryUsage') }}</span>
            <span class="panel-badge" :class="memLoadClass">{{ store.data.memory.percent }}%</span>
          </div>
          <div class="mem-main">
            <span class="mem-used">{{ store.data.memory.used }}</span>
            <span class="mem-sep">/</span>
            <span class="mem-total">{{ store.data.memory.total }}</span>
          </div>
          <div class="mem-bar-wrap">
            <div class="mem-bar">
              <div class="mem-bar-fill" :style="{ width: store.data.memory.percent + '%' }">
                <div class="mem-bar-shine"></div>
              </div>
            </div>
          </div>
          <div class="mem-breakdown">
            <div class="mem-bitem">
              <span class="bdot" :style="{ background: 'var(--chart-cpu-normal)' }"></span>
              <span class="blabel">Used</span>
              <span class="bval">{{ store.data.memory.used }}</span>
            </div>
            <div class="mem-bitem">
              <span class="bdot" :style="{ background: 'var(--color-success)' }"></span>
              <span class="blabel">Buff/Cache</span>
              <span class="bval">{{ store.data.memory.buffersCache }}</span>
            </div>
          </div>
        </div>

        <!-- ═══ Disk I/O + Network dual panel ═══ -->
        <div class="metrics-row">
          <!-- Disk I/O -->
          <div class="metric-panel">
            <div class="panel-header">
              <span class="panel-dot" :style="{ background: 'var(--chart-cpu-normal)' }"></span>
              <span class="panel-title">{{ t('monitor.diskIo') }}</span>
            </div>
            <div class="io-stats">
              <div class="io-item">
                <span class="io-arrow io-read">↓</span>
                <span class="io-label">{{ t('monitor.read') }}</span>
                <span class="io-val read">{{ store.data.diskIo.readMBps.toFixed(1) }} MB/s</span>
              </div>
              <div class="io-divider"></div>
              <div class="io-item">
                <span class="io-arrow io-write">↑</span>
                <span class="io-label">{{ t('monitor.write') }}</span>
                <span class="io-val write">{{ store.data.diskIo.writeMBps.toFixed(1) }} MB/s</span>
              </div>
            </div>
            <svg viewBox="0 0 200 36" class="mini-sparkline">
              <polygon :points="diskReadSparkFill" fill="#5b9bd5" opacity="0.12" />
              <polyline :points="diskReadSparkPoints" fill="none" stroke="var(--chart-cpu-normal)" stroke-width="1.5" />
              <polyline :points="diskWriteSparkPoints" fill="none" stroke="var(--chart-cpu-warning)" stroke-width="1.5" />
            </svg>
            <div class="spark-legend">
              <span class="sdot" style="background:var(--chart-cpu-normal)"></span>Read
              <span class="sdot" style="background:var(--chart-cpu-warning);margin-left:10px"></span>Write
            </div>
          </div>

          <!-- Network I/O -->
          <div class="metric-panel">
            <div class="panel-header">
              <span class="panel-dot" :style="{ background: 'var(--chart-net-tx)' }"></span>
              <span class="panel-title">{{ t('monitor.networkIo') }}</span>
            </div>
            <div class="io-stats">
              <div class="io-item">
                <span class="io-arrow io-read">↓</span>
                <span class="io-label">RX</span>
                <span class="io-val read">{{ store.data.network.rxMBps.toFixed(2) }} MB/s</span>
              </div>
              <div class="io-divider"></div>
              <div class="io-item">
                <span class="io-arrow io-write">↑</span>
                <span class="io-label">TX</span>
                <span class="io-val write">{{ store.data.network.txMBps.toFixed(2) }} MB/s</span>
              </div>
            </div>
            <svg viewBox="0 0 200 36" class="mini-sparkline">
              <polygon :points="netRxSparkFill" fill="#5b9bd5" opacity="0.12" />
              <polyline :points="netRxSparkPoints" fill="none" stroke="var(--chart-cpu-normal)" stroke-width="1.5" />
              <polyline :points="netTxSparkPoints" fill="none" stroke="var(--chart-net-tx)" stroke-width="1.5" />
            </svg>
            <div class="spark-legend">
              <span class="sdot" style="background:var(--chart-cpu-normal)"></span>RX
              <span class="sdot" style="background:var(--chart-net-tx);margin-left:10px"></span>TX
            </div>
          </div>
        </div>

        <!-- ═══ Disk Usage ═══ -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">{{ t('monitor.diskUsage') }}</span>
          </div>
          <div class="disk-list">
            <div v-for="d in store.data.disks" :key="d.device" class="disk-row">
              <div class="disk-info">
                <span class="disk-dev">{{ d.device }}</span>
                <span class="disk-mount">{{ d.mount }}</span>
              </div>
              <div class="disk-gauge">
                <div class="disk-bar">
                  <div class="disk-bar-fill"
                    :style="{ width: d.percent + '%' }"
                    :class="{ warn: d.percent > 80, danger: d.percent > 90 }"></div>
                </div>
                <div class="disk-nums">
                  <span class="disk-size">{{ d.used }} / {{ d.size }}</span>
                  <span class="disk-pct" :class="{ warn: d.percent > 80, danger: d.percent > 90 }">{{ d.percent }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══ Process Table ═══ -->
        <div class="section-block">
          <div class="section-header">
            <span class="section-title">{{ t('monitor.runningProcesses') }}</span>
            <span class="section-count">{{ store.data.processes.length }}</span>
          </div>
          <div class="proc-table-wrap">
            <table class="proc-table">
              <thead>
                <tr>
                  <th class="th-name">NAME</th>
                  <th class="th-num">PID</th>
                  <th class="th-num">CPU%</th>
                  <th class="th-num">MEM%</th>
                  <th class="th-status">STATUS</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in store.data.processes" :key="p.pid">
                  <td class="proc-name" :title="p.name">{{ p.name }}</td>
                  <td class="cell-mono">{{ p.pid }}</td>
                  <td class="cell-mono" :class="{ warn: p.cpu > 50, danger: p.cpu > 80 }">{{ p.cpu.toFixed(1) }}</td>
                  <td class="cell-mono" :class="{ warn: p.mem > 10, danger: p.mem > 25 }">{{ p.mem.toFixed(1) }}</td>
                  <td><span class="proc-status" :class="statusClass(p.status)">{{ p.status }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Status bar -->
      <div class="monitor-status-bar">
        <span class="status-dot" :class="{ connected: store.hasData }"></span>
        {{ store.hasData ? t('monitor.live') : t('monitor.idle') }}
        <span v-if="refreshActive" class="auto-tag">Auto {{ refreshIntervalSec }}s</span>
      </div>
    </template>

    <!-- Context menu -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMonitorStore } from '@/stores/monitor'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { Connection, Loading, Refresh, Clock, Cpu, Grid, Coin } from '@element-plus/icons-vue'

const store = useMonitorStore()
const sshStore = useSshStore()
const { t, locale } = useLocale()

const ctx = reactive({ visible: false, x: 0, y: 0 })
function onCtx(e: MouseEvent) { ctx.x = e.clientX; ctx.y = e.clientY; ctx.visible = true }
function hideCtx() { ctx.visible = false }
function ctxAct(action: string) { hideCtx(); if (action === 'refresh') store.fetchData() }
onMounted(() => document.addEventListener('click', hideCtx))
onUnmounted(() => document.removeEventListener('click', hideCtx))

const refreshActive = ref(false)
const refreshIntervalSec = 5
let _timer: ReturnType<typeof setInterval> | null = null

const hasSession = computed(() => {
  const s = sshStore.activeSession
  return !!(s && s.realSessionId && s.status === 'connected')
})

const serverInfo = computed(() => {
  const s = sshStore.activeSession
  if (!s) return { name: '', host: '' }
  const svr = sshStore.servers.find((x: { id: string }) => x.id === s.serverId)
  return { name: s.serverName, host: svr?.host || '' }
})

// CPU donut
const cpuDasharray = computed(() => {
  const pct = store.data?.cpu.usagePercent || 0
  const c = 2 * Math.PI * 50
  const filled = (pct / 100) * c
  return `${filled} ${c - filled}`
})

const cpuGradient = computed(() => {
  const pct = store.data?.cpu.usagePercent || 0
  if (pct > 80) return getCssVar('--chart-cpu-danger') || '#e05555'
  if (pct > 50) return getCssVar('--chart-cpu-warning') || '#e69138'
  return getCssVar('--chart-cpu-normal') || '#5b9bd5'
})

const cpuLoadClass = computed(() => {
  const p = store.data?.cpu.usagePercent || 0
  if (p > 80) return 'danger'
  if (p > 50) return 'warn'
  return ''
})

const memLoadClass = computed(() => {
  const p = store.data?.memory.percent || 0
  if (p > 90) return 'danger'
  if (p > 70) return 'warn'
  return ''
})

function getCssVar(name: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  } catch { return '' }
}

// Sparkline helpers
function sparkPoints(values: number[], maxVal: number, w = 200, h = 36): string {
  if (!values.length) return ''
  const n = values.length
  const stepX = w / Math.max(n - 1, 1)
  const clamped = maxVal > 0 ? maxVal : 1
  return values.map((v, i) => {
    const x = i * stepX
    const y = h - (v / clamped) * (h - 6) - 3
    return `${x},${y}`
  }).join(' ')
}

function sparkFill(values: number[], maxVal: number, w = 200, h = 36): string {
  if (!values.length) return ''
  const points = sparkPoints(values, maxVal, w, h)
  return `0,${h} ${points} ${w},${h}`
}

const cpuSparkPoints = computed(() => sparkPoints(store.data?.cpu.history || [], 100))
const cpuSparkFill = computed(() => sparkFill(store.data?.cpu.history || [], 100))
const cpuSparkPointsWide = computed(() => sparkPoints(store.data?.cpu.history || [], 100, 300, 40))
const cpuSparkFillWide = computed(() => sparkFill(store.data?.cpu.history || [], 100, 300, 40))
const diskReadSparkPoints = computed(() => sparkPoints(store.data?.diskIo.readHistory || [], Math.max(...(store.data?.diskIo.readHistory || [1]), 1)))
const diskReadSparkFill = computed(() => sparkFill(store.data?.diskIo.readHistory || [], Math.max(...(store.data?.diskIo.readHistory || [1]), 1)))
const diskWriteSparkPoints = computed(() => sparkPoints(store.data?.diskIo.writeHistory || [], Math.max(...(store.data?.diskIo.writeHistory || [1]), 1)))
const netRxSparkPoints = computed(() => sparkPoints(store.data?.network.rxHistory || [], Math.max(...(store.data?.network.rxHistory || [1]), 1)))
const netRxSparkFill = computed(() => sparkFill(store.data?.network.rxHistory || [], Math.max(...(store.data?.network.rxHistory || [1]), 1)))
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

watch(hasSession, (active) => {
  if (active) startRefresh()
  else stopRefresh()
}, { immediate: true })

onUnmounted(() => stopRefresh())
</script>

<style lang="scss" scoped>
.system-monitor {
  --ring-bg: #{$color-border};
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 12px;
  color: $color-text-regular;
}

// ═══════ Empty / Loading ═══════
.monitor-empty, .monitor-loading {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: $color-text-secondary;
}

.empty-icon-wrap {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 14px;
  background: $color-bg-hover;
  color: $color-text-muted;
  margin-bottom: 4px;
}

.empty-title { font-size: 14px; font-weight: 600; color: $color-text-secondary; margin: 0; }
.empty-sub { font-size: 11px; color: $color-text-muted; margin: 0; }
.loading-text { font-size: 12px; color: $color-text-secondary; margin: 0; }
.spinning { animation: spin 1.2s linear infinite; color: $color-primary; }
@keyframes spin { to { transform: rotate(360deg); } }

// ═══════ Scroll area ═══════
.monitor-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: $color-border; border-radius: 2px; }
}

// ═══════ Info Bar ═══════
.info-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: $color-bg-hover;
  border-radius: 5px;
  font-family: $font-family-mono;
  font-size: 10px;
  color: $color-text-secondary;
  flex-shrink: 0;

  .info-left { display: flex; align-items: center; gap: 5px; overflow: hidden; flex-wrap: wrap; }
  .info-os { color: $color-primary-light; font-weight: 600; white-space: nowrap; }
  .info-sep { color: $color-border; font-weight: 300; }
  .info-label { color: $color-text-muted; text-transform: uppercase; font-size: 9px; letter-spacing: 0.3px; }
  .info-val { color: $color-text-primary; }
  .info-time { color: $color-info; }
  .info-right { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
}

// ═══════ Overview Cards — 2-col grid ═══════
.overview-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 6px;
}

.over-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: $glass-bg;
  border: 1px solid $glass-border;
  border-left: 2px solid $color-primary;
  border-radius: 6px;
  box-shadow: $elevation-1;
  transition: border-color 0.2s, box-shadow 0.22s ease, transform 0.22s ease;
  animation: fade-in-up 0.3s ease backwards;

  &:hover { box-shadow: $elevation-2; transform: translateY(-2px); }

  &:nth-child(1) { animation-delay: 0.02s; }
  &:nth-child(2) { border-left-color: $color-success; animation-delay: 0.06s; }
  &:nth-child(3) { border-left-color: var(--chart-cpu-warning); animation-delay: 0.10s; }
  &:nth-child(4) { border-left-color: $color-info; animation-delay: 0.14s; }

  .card-icon {
    width: 32px; height: 32px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px;
    background: $color-bg-active;
    color: $color-primary;
    flex-shrink: 0;
  }

  .card-body {
    display: flex; flex-direction: column; gap: 2px;
    overflow: hidden; min-width: 0;
  }

  .card-label {
    font-size: 9px;
    color: $color-text-muted;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 600;
    white-space: nowrap;
  }

  .card-val {
    font-size: clamp(10px, 1.5vw, 13px);
    color: $color-text-primary;
    font-family: $font-family-mono;
    font-weight: 500;
    word-break: break-word;
    overflow-wrap: break-word;
    line-height: 1.35;
  }

  .truncate {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
}

// ═══════ Metrics Row — 2-col grid ═══════
.metrics-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

// ═══════ Metric Panel ═══════
.metric-panel {
  background: $glass-bg;
  border: 1px solid $glass-border;
  border-radius: 8px;
  padding: 10px;
  box-shadow: $elevation-1;
  transition: box-shadow 0.22s ease, transform 0.22s ease;
  animation: fade-in-up 0.3s ease backwards;

  &:hover { box-shadow: $elevation-2; transform: translateY(-1px); }
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.panel-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.panel-title {
  font-size: 10px;
  font-weight: 600;
  color: $color-text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.panel-badge {
  font-size: 11px;
  font-weight: 700;
  font-family: $font-family-mono;
  padding: 1px 6px;
  border-radius: 10px;
  background: $color-bg-active;
  color: $color-text-primary;

  &.warn { background: $color-bg-warning-hover; color: $color-warning; }
  &.danger { background: $color-bg-danger-hover; color: $color-danger; }
}

// ═══════ CPU Ring ═══════
.cpu-ring-wrap {
  display: flex;
  align-items: center;
  gap: 14px;
  justify-content: center;
  margin-bottom: 6px;
}

.cpu-ring {
  width: 84px; height: 84px;
  flex-shrink: 0;
}

.cpu-ring-fill {
  transition: stroke-dasharray 0.6s ease;
  filter: drop-shadow(0 0 3px rgba(91,157,213,0.3));
}

.ring-pct {
  font-size: 17px; font-weight: 700;
  fill: $color-text-primary;
  font-family: $font-family-mono;
}

.ring-label {
  font-size: 9px;
  fill: $color-text-secondary;
  font-weight: 500;
}

.cpu-details {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 10px;
  font-family: $font-family-mono;
}

.cpu-line { display: flex; gap: 10px; align-items: center; }
.clabel { color: $color-text-muted; width: 36px; text-align: right; font-size: 9px; }
.cval { color: $color-text-primary; }
.idle-val { color: $color-success; }

// ═══════ Memory ═══════
.mem-main {
  text-align: center;
  margin-bottom: 8px;
  font-family: $font-family-mono;
  display: flex; align-items: baseline; justify-content: center; gap: 3px;
}
.mem-used { font-size: 22px; font-weight: 700; color: $color-text-primary; }
.mem-sep { font-size: 14px; color: $color-text-muted; }
.mem-total { font-size: 14px; color: $color-text-secondary; }

.mem-bar-wrap { padding: 0 2px; margin-bottom: 8px; }
.mem-bar {
  height: 10px;
  background: $color-border;
  border-radius: 5px;
  overflow: hidden;
}
.mem-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #5b9bd5, #4888c2);
  border-radius: 5px;
  transition: width 0.6s ease;
  position: relative;
}
.mem-bar-shine {
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(255,255,255,0.15) 0%, transparent 50%);
}

.mem-breakdown { display: flex; flex-direction: column; gap: 4px; font-size: 10px; }
.mem-bitem { display: flex; align-items: center; gap: 6px; }
.bdot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.blabel { color: $color-text-secondary; flex: 1; }
.bval { color: $color-text-primary; font-family: $font-family-mono; font-weight: 500; }

// ═══════ I/O Stats ═══════
.io-stats {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
}

.io-item {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}

.io-arrow {
  font-size: 14px; font-weight: 700; line-height: 1;
  &.io-read { color: $color-chart-blue; }
  &.io-write { color: $color-chart-orange; }
}

.io-label { font-size: 9px; color: $color-text-muted; text-transform: uppercase; letter-spacing: 0.3px; }
.io-val {
  font-size: 11px; font-family: $font-family-mono; font-weight: 600;
  &.read { color: $color-chart-blue; }
  &.write { color: $color-chart-orange; }
}

.io-divider {
  width: 1px; height: 28px;
  background: $color-border-light;
  flex-shrink: 0;
}

.mini-sparkline {
  width: 100%;
  height: 36px;
  display: block;
}

.spark-legend {
  display: flex; align-items: center; gap: 2px;
  font-size: 9px; color: $color-text-muted;
  margin-top: 3px;
}

.sdot {
  display: inline-block;
  width: 6px; height: 6px;
  border-radius: 50%;
  margin-right: 3px;
}

// ═══════ Section Block (Disk / Process) ═══════
.section-block {
  background: $glass-bg;
  border: 1px solid $glass-border;
  border-radius: 8px;
  padding: 10px;
  box-shadow: $elevation-1;
  animation: fade-in-up 0.3s ease backwards;
}

.section-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 10px;
}

.section-title {
  font-size: 10px; font-weight: 600;
  color: $color-text-secondary;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  flex: 1;
}

.section-count {
  font-size: 10px; font-weight: 600;
  color: $color-text-muted;
  font-family: $font-family-mono;
  background: $color-bg-active;
  padding: 1px 7px; border-radius: 10px;
}

// ═══════ Disk List ═══════
.disk-list { display: flex; flex-direction: column; gap: 8px; }

.disk-row {
  display: flex; flex-direction: column; gap: 4px;
}

.disk-info {
  display: flex; align-items: baseline; gap: 8px;
}

.disk-dev {
  font-size: 12px; color: $color-text-primary;
  font-family: $font-family-mono; font-weight: 600;
}
.disk-mount {
  font-size: 10px; color: $color-text-muted;
  font-family: $font-family-mono;
}

.disk-gauge { display: flex; flex-direction: column; gap: 3px; }

.disk-bar {
  height: 7px;
  background: $color-border;
  border-radius: 4px;
  overflow: hidden;
}

.disk-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #5b9bd5, #5b8def);
  border-radius: 4px;
  transition: width 0.6s ease;
  &.warn { background: linear-gradient(90deg, #e69138, #d17d2a); }
  &.danger { background: linear-gradient(90deg, #e05555, #c94040); }
}

.disk-nums {
  display: flex; justify-content: space-between;
  font-size: 10px; font-family: $font-family-mono;
}

.disk-size { color: $color-text-secondary; }
.disk-pct {
  font-weight: 600;
  &.warn { color: $color-chart-orange; }
  &.danger { color: $color-chart-red; }
}

// ═══════ Process Table ═══════
.proc-table-wrap {
  max-height: 240px;
  overflow-y: auto;
  border-radius: 4px;

  &::-webkit-scrollbar { width: 4px; }
  &::-webkit-scrollbar-thumb { background: $color-border; border-radius: 2px; }
}

.proc-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;

  thead { position: sticky; top: 0; z-index: 1; }

  th {
    text-align: left;
    padding: 6px 8px;
    color: $color-text-muted;
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    border-bottom: 1px solid $color-border;
    background: $color-bg-surface;
  }

  .th-name { width: auto; }
  .th-num { width: 44px; text-align: right; }
  .th-status { width: 56px; }

  td {
    padding: 5px 8px;
    color: $color-text-regular;
    border-bottom: 1px solid $color-border-light;
  }

  tbody tr {
    transition: background 0.12s;
    &:hover { background: $color-bg-active; }
  }

  .proc-name {
    max-width: 110px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    font-weight: 500;
  }

  .cell-mono {
    font-family: $font-family-mono; font-size: 11px; text-align: right;
    &.warn { color: $color-warning; font-weight: 600; }
    &.danger { color: $color-danger; font-weight: 600; }
  }
}

.proc-status {
  display: inline-block;
  font-size: 9px; font-weight: 600;
  padding: 2px 6px; border-radius: 3px;
  letter-spacing: 0.3px; text-transform: uppercase;

  &.running { color: $color-success; background: $color-bg-success-hover; }
  &.sleeping { color: $color-text-secondary; background: $color-border-light; }
  &.blocked { color: $color-chart-orange; background: $color-bg-warning-hover; }
  &.zombie { color: $color-danger; background: $color-bg-danger-hover; }
  &.stopped { color: $color-warning; background: $color-bg-warning-hover; }
}

// ═══════ Status bar ═══════
.monitor-status-bar {
  display: flex;
  align-items: center;
  padding: 5px 12px;
  border-top: 1px solid $color-border-light;
  font-size: 10px;
  color: $color-text-secondary;
  font-family: $font-family-mono;
  flex-shrink: 0;
  background: $color-bg-app;

  .status-dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: $color-text-muted; margin-right: 6px;
    transition: background 0.3s;
    &.connected { background: $color-success; box-shadow: 0 0 4px rgba($color-success, 0.4); }
  }

  .auto-tag {
    margin-left: auto;
    font-size: 9px;
    color: $color-text-muted;
    background: $color-bg-hover;
    padding: 1px 6px; border-radius: 3px;
  }
}
</style>
