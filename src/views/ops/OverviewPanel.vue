<!-- OverviewPanel — 运维总览仪表盘（图文并用） -->
<template>
  <div class="ov-panel">
    <div class="ov-actionbar">
      <el-button type="primary" size="small" :loading="sampling" @click="refresh">
        <el-icon :size="13" v-if="!sampling"><Refresh /></el-icon>
        {{ sampling ? t('ops.ovSampling') : t('ops.ovRefresh') }}
      </el-button>
      <span v-if="lastTs" class="ov-time">{{ formatTime(lastTs) }}</span>
    </div>

    <div class="ov-scroll" v-if="hasData">
      <!-- 统计卡 -->
      <div class="ov-stats">
        <div class="stat-card c1">
          <div class="stat-icon"><el-icon :size="20"><Monitor /></el-icon></div>
          <div class="stat-body"><span class="stat-num">{{ onlineCount }}</span><span class="stat-label">{{ t('ops.ovOnline') }}</span></div>
        </div>
        <div class="stat-card c2">
          <div class="stat-icon"><el-icon :size="20"><Cpu /></el-icon></div>
          <div class="stat-body"><span class="stat-num">{{ avgCpu }}<i>%</i></span><span class="stat-label">{{ t('ops.ovAvgCpu') }}</span></div>
        </div>
        <div class="stat-card c3">
          <div class="stat-icon"><el-icon :size="20"><Coin /></el-icon></div>
          <div class="stat-body"><span class="stat-num">{{ avgMem }}<i>%</i></span><span class="stat-label">{{ t('ops.ovAvgMem') }}</span></div>
        </div>
        <div class="stat-card c4">
          <div class="stat-icon"><el-icon :size="20"><Bell /></el-icon></div>
          <div class="stat-body"><span class="stat-num">{{ alertStore.events.length }}</span><span class="stat-label">{{ t('ops.ovAlerts') }}</span></div>
        </div>
      </div>

      <!-- 服务器资源环形仪表 -->
      <div class="ov-section">
        <div class="ov-sec-title"><el-icon :size="13"><Odometer /></el-icon>{{ t('ops.ovFleetResources') }}</div>
        <div class="ov-fleet">
          <div v-for="s in fleet" :key="s.id" class="fleet-card">
            <div class="fleet-head">
              <span class="fleet-dot" :class="{ off: !s.m.ok }"></span>
              <span class="fleet-name">{{ s.name }}</span>
              <span class="fleet-load">{{ t('ops.ovLoad') }} {{ s.m.load.toFixed(1) }} · {{ s.m.cores }}{{ t('ops.ovCores') }}</span>
            </div>
            <div class="fleet-rings">
              <div class="ring" v-for="r in ringsOf(s.m)" :key="r.key">
                <svg viewBox="0 0 72 72">
                  <circle cx="36" cy="36" r="30" fill="none" stroke="var(--color-border, rgba(255,255,255,0.1))" stroke-width="6" />
                  <circle cx="36" cy="36" r="30" fill="none" :stroke="r.color" stroke-width="6" stroke-linecap="round"
                    :stroke-dasharray="`${(r.val/100)*188.4} 188.4`" transform="rotate(-90 36 36)" class="ring-fill" />
                  <text x="36" y="40" text-anchor="middle" class="ring-num" :style="{ fill: r.color }">{{ Math.round(r.val) }}</text>
                </svg>
                <span class="ring-label">{{ r.key }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 资源对比 + 最近告警 -->
      <div class="ov-cols">
        <div class="ov-section flex1">
          <div class="ov-sec-title"><el-icon :size="13"><Histogram /></el-icon>{{ t('ops.ovResourceCompare') }}</div>
          <div class="ov-bars">
            <div v-for="s in fleet" :key="s.id" class="bar-row">
              <span class="bar-name">{{ s.name }}</span>
              <div class="bar-track">
                <div class="bar-seg cpu" :style="{ width: s.m.cpu + '%' }" :title="'CPU ' + s.m.cpu + '%'"></div>
              </div>
              <div class="bar-track">
                <div class="bar-seg mem" :style="{ width: s.m.mem + '%' }" :title="'MEM ' + s.m.mem + '%'"></div>
              </div>
              <div class="bar-track">
                <div class="bar-seg disk" :style="{ width: s.m.disk + '%' }" :title="'DISK ' + s.m.disk + '%'"></div>
              </div>
            </div>
          </div>
          <div class="ov-legend">
            <span><i class="lg cpu"></i>CPU</span><span><i class="lg mem"></i>MEM</span><span><i class="lg disk"></i>DISK</span>
          </div>
        </div>

        <div class="ov-section flex1">
          <div class="ov-sec-title"><el-icon :size="13"><Bell /></el-icon>{{ t('ops.ovRecentAlerts') }}</div>
          <div class="ov-alerts">
            <div v-if="alertStore.events.length === 0" class="ov-alerts-empty">{{ t('ops.noAlerts') }}</div>
            <div v-for="ev in alertStore.events.slice(0, 8)" :key="ev.id" class="ov-alert" :class="ev.severity">
              <span class="oa-dot" :class="ev.severity"></span>
              <span class="oa-server">{{ ev.serverName }}</span>
              <span class="oa-msg">{{ ev.metric.toUpperCase() }} {{ ev.value }}{{ ev.metric === 'load' ? '' : '%' }}</span>
              <span class="oa-time">{{ formatTime(ev.ts) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="ov-placeholder">
      <el-icon :size="40"><Odometer /></el-icon>
      <p>{{ connectedSessions.length === 0 ? t('ops.noConnected') : t('ops.ovNoData') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Refresh, Monitor, Cpu, Coin, Bell, Odometer, Histogram } from '@element-plus/icons-vue'
import { useSshStore } from '@/stores/ssh'
import { useAlertStore } from '@/stores/alerts'
import { sampleMetrics } from '@/utils/metrics-sample'
import type { QuickMetrics } from '@/utils/metrics-sample'
import { useLocale } from '@/composables/useLocale'

const sshStore = useSshStore()
const alertStore = useAlertStore()
const { t } = useLocale()

const sampling = ref(false)
const lastTs = ref(0)
const samples = ref<Record<string, QuickMetrics>>({})

const connectedSessions = computed(() => sshStore.sessions.filter(s => s.status === 'connected' && s.realSessionId))

const fleet = computed(() =>
  connectedSessions.value
    .filter(s => samples.value[s.serverId])
    .map(s => ({ id: s.serverId, name: s.serverName, m: samples.value[s.serverId] }))
)
const hasData = computed(() => fleet.value.length > 0)
const onlineCount = computed(() => connectedSessions.value.length)
const avgCpu = computed(() => avg(fleet.value.map(s => s.m.cpu)))
const avgMem = computed(() => avg(fleet.value.map(s => s.m.mem)))
const avgDisk = computed(() => avg(fleet.value.map(s => s.m.disk)))

function avg(arr: number[]): number { return arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : 0 }

function color(p: number): string {
  if (p >= 85) return 'var(--color-danger, #d45454)'
  if (p >= 60) return 'var(--chart-cpu-warning, #e69138)'
  return 'var(--color-success, #4caf7d)'
}
function ringsOf(m: QuickMetrics) {
  return [
    { key: 'CPU', val: m.cpu, color: color(m.cpu) },
    { key: 'MEM', val: m.mem, color: color(m.mem) },
    { key: 'DISK', val: m.disk, color: color(m.disk) },
  ]
}

function formatTime(ts: number): string {
  const d = new Date(ts); const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const OV_KEY = 'ops-overview-cache'

async function refresh() {
  const sessions = connectedSessions.value
  if (sessions.length === 0) return
  sampling.value = true
  await Promise.all(sessions.map(async (s) => {
    const m = await sampleMetrics(s.realSessionId!)
    samples.value = { ...samples.value, [s.serverId]: m }
  }))
  lastTs.value = Date.now()
  sampling.value = false
  try { localStorage.setItem(OV_KEY, JSON.stringify({ samples: samples.value, ts: lastTs.value })) } catch {}
}

onMounted(() => {
  // 恢复上次缓存，立即有数据可看
  try {
    const s = localStorage.getItem(OV_KEY)
    if (s) { const p = JSON.parse(s); samples.value = p.samples || {}; lastTs.value = p.ts || 0 }
  } catch {}
  // 进入即自动采集最新数据（有已连接服务器时）
  if (connectedSessions.value.length > 0) refresh()
})
</script>

<style lang="scss" scoped>
.ov-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }
.ov-actionbar { display: flex; align-items: center; gap: $spacing-md; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; flex-shrink: 0;
  .ov-time { font-size: $font-size-xs; color: $color-text-placeholder; font-family: $font-family-mono; }
}
.ov-scroll { flex: 1; overflow-y: auto; padding: $spacing-md; display: flex; flex-direction: column; gap: $spacing-md; min-height: 0; }
.ov-scroll > * { flex-shrink: 0; }

// ── 统计卡 ──
.ov-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: $spacing-md; }
.stat-card {
  display: flex; align-items: center; gap: 12px; padding: $spacing-md $spacing-lg;
  border-radius: $border-radius-lg; background: $glass-bg; border: 1px solid $glass-border;
  box-shadow: $elevation-1; animation: fade-in-up 0.3s ease backwards; overflow: hidden; position: relative;
  &::after { content: ''; position: absolute; right: -20px; top: -20px; width: 80px; height: 80px; border-radius: 50%; opacity: 0.08; }
  &.c1::after { background: #5b9bd5; } &.c2::after { background: #e69138; }
  &.c3::after { background: #4caf7d; } &.c4::after { background: #d45454; }
  &:nth-child(2) { animation-delay: .05s; } &:nth-child(3) { animation-delay: .1s; } &:nth-child(4) { animation-delay: .15s; }
}
.stat-icon {
  width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  color: #fff;
}
.c1 .stat-icon { background: linear-gradient(135deg, #5b9bd5, #4888c2); }
.c2 .stat-icon { background: linear-gradient(135deg, #e69138, #d17d2a); }
.c3 .stat-icon { background: linear-gradient(135deg, #4caf7d, #3d9169); }
.c4 .stat-icon { background: linear-gradient(135deg, #d45454, #c94040); }
.stat-body { display: flex; flex-direction: column; }
.stat-num { font-size: 26px; font-weight: 800; color: $color-text-primary; font-family: $font-family-mono; line-height: 1.1;
  i { font-size: 14px; font-style: normal; color: $color-text-secondary; margin-left: 2px; }
}
.stat-label { font-size: 10px; color: $color-text-secondary; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

// ── 区块 ──
.ov-section { border-radius: $border-radius-lg; background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1; padding: $spacing-md; }
.ov-sec-title { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; margin-bottom: $spacing-md;
  .el-icon { color: $color-primary; }
}

// ── 服务器环形仪表 ──
.ov-fleet { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: $spacing-md; }
.fleet-card { padding: $spacing-md; border-radius: $border-radius-md; background: $color-bg-hover; border: 1px solid $color-border-light; animation: fade-in-up 0.3s ease; }
.fleet-head { display: flex; align-items: center; gap: 6px; margin-bottom: 10px; }
.fleet-dot { width: 8px; height: 8px; border-radius: 50%; background: $color-success; box-shadow: 0 0 5px rgba(76,175,125,0.5); flex-shrink: 0;
  &.off { background: $color-text-muted; box-shadow: none; }
}
.fleet-name { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fleet-load { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }
.fleet-rings { display: flex; justify-content: space-around; }
.ring { display: flex; flex-direction: column; align-items: center; gap: 3px;
  svg { width: 56px; height: 56px; }
  .ring-fill { transition: stroke-dasharray 0.7s ease; }
  .ring-num { font-size: 18px; font-weight: 700; font-family: $font-family-mono; }
  .ring-label { font-size: 9px; color: $color-text-secondary; letter-spacing: 0.5px; }
}

// ── 两列 ──
.ov-cols { display: flex; gap: $spacing-md; align-items: flex-start; }
.flex1 { flex: 1; min-width: 0; }

// ── 资源对比条 ──
.ov-bars { display: flex; flex-direction: column; gap: 8px; }
.bar-row { display: grid; grid-template-columns: 90px 1fr 1fr 1fr; align-items: center; gap: 6px; }
.bar-name { font-size: $font-size-xs; color: $color-text-primary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar-track { height: 8px; background: $color-border; border-radius: 4px; overflow: hidden; }
.bar-seg { height: 100%; border-radius: 4px; transition: width 0.7s ease;
  &.cpu { background: linear-gradient(90deg, #5b9bd5, #4888c2); }
  &.mem { background: linear-gradient(90deg, #4caf7d, #3d9169); }
  &.disk { background: linear-gradient(90deg, #e69138, #d17d2a); }
}
.ov-legend { display: flex; gap: 14px; margin-top: 10px; font-size: 10px; color: $color-text-secondary;
  span { display: inline-flex; align-items: center; gap: 4px; }
  .lg { width: 10px; height: 10px; border-radius: 2px; display: inline-block;
    &.cpu { background: #5b9bd5; } &.mem { background: #4caf7d; } &.disk { background: #e69138; }
  }
}

// ── 告警时间线 ──
.ov-alerts { display: flex; flex-direction: column; gap: 5px; }
.ov-alerts-empty { padding: $spacing-lg; text-align: center; font-size: $font-size-xs; color: $color-text-placeholder; }
.ov-alert { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: $border-radius-sm; background: $color-bg-hover; border-left: 2px solid transparent;
  &.critical { border-left-color: $color-danger; } &.warning { border-left-color: $color-warning; }
}
.oa-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  &.critical { background: $color-danger; } &.warning { background: $color-warning; }
}
.oa-server { font-size: $font-size-xs; font-weight: 600; color: $color-text-primary; }
.oa-msg { font-size: $font-size-xs; color: $color-text-secondary; font-family: $font-family-mono; flex: 1; }
.oa-time { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }

.ov-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
}
</style>
