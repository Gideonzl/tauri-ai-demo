<!-- AlertsPanel — 实时告警监控 -->
<template>
  <div class="alerts-panel">
    <!-- 左：阈值规则 + 监控开关 -->
    <div class="ap-config">
      <div class="ap-section-title">{{ t('ops.alertRules') }}</div>
      <div class="ap-rule" v-for="rule in store.rules" :key="rule.metric">
        <div class="ap-rule-head">
          <el-switch v-model="rule.enabled" size="small" @change="store.saveRules()" />
          <span class="ap-rule-name">{{ metricLabel(rule.metric) }}</span>
          <span class="ap-rule-sev" :class="rule.severity">{{ rule.severity === 'critical' ? t('ops.sevCritical') : t('ops.sevWarning') }}</span>
        </div>
        <div class="ap-rule-body" v-if="rule.metric !== 'load'">
          <span class="ap-op">&gt;</span>
          <el-slider v-model="rule.threshold" :min="10" :max="100" size="small" @change="store.saveRules()" class="ap-slider" />
          <span class="ap-val">{{ rule.threshold }}%</span>
        </div>
        <div class="ap-rule-body" v-else>
          <span class="ap-load-hint">{{ t('ops.metricLoad') }} &gt; {{ liveSample ? (liveSample.cores * 2) : '核数×2' }}</span>
        </div>
      </div>

      <div class="ap-watch">
        <el-button :type="store.watching ? 'danger' : 'primary'" size="small" style="width:100%" :disabled="!sessionId" @click="toggleWatch">
          <el-icon :size="13"><VideoPause v-if="store.watching" /><VideoPlay v-else /></el-icon>
          {{ store.watching ? t('ops.stopWatch') : t('ops.startWatch') }}
        </el-button>
        <div v-if="store.watching && liveSample" class="ap-live">
          <span class="ap-live-badge">{{ t('ops.watching') }}</span>
          <span class="ap-live-metric">CPU {{ liveSample.cpu }}%</span>
          <span class="ap-live-metric">MEM {{ liveSample.mem }}%</span>
          <span class="ap-live-metric">DISK {{ liveSample.disk }}%</span>
          <span class="ap-live-metric">LOAD {{ liveSample.load.toFixed(1) }}</span>
        </div>
      </div>
    </div>

    <!-- 右：告警时间线 -->
    <div class="ap-timeline">
      <div class="ap-timeline-head">
        <span class="ap-section-title">{{ t('ops.alertHistory') }}</span>
        <el-button v-if="store.events.length" size="small" text @click="store.clearEvents()">{{ t('ops.clearAlerts') }}</el-button>
      </div>
      <div class="ap-events" @scroll="markRead">
        <div v-if="store.events.length === 0" class="ap-no-events">
          <el-icon :size="28"><Bell /></el-icon>
          <span>{{ t('ops.noAlerts') }}</span>
        </div>
        <div v-for="ev in store.events" :key="ev.id" class="ap-event" :class="[ev.severity, { unread: !ev.read }]">
          <span class="ap-ev-dot" :class="ev.severity"></span>
          <div class="ap-ev-body">
            <div class="ap-ev-msg">
              <span class="ap-ev-server">{{ ev.serverName }}</span>
              {{ t('ops.alertTriggered', { metric: metricLabel(ev.metric), value: ev.value + (ev.metric === 'load' ? '' : '%'), threshold: ev.threshold + (ev.metric === 'load' ? '' : '%') }) }}
            </div>
            <span class="ap-ev-time">{{ formatTime(ev.ts) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { VideoPlay, VideoPause, Bell } from '@element-plus/icons-vue'
import { useAlertStore } from '@/stores/alerts'
import type { AlertMetric } from '@/stores/alerts'
import { useLocale } from '@/composables/useLocale'

const props = defineProps<{ sessionId: string; serverName: string; serverId: string }>()

const store = useAlertStore()
const { t } = useLocale()

const liveSample = computed(() => store.currentSample)

function metricLabel(m: AlertMetric): string {
  return { cpu: t('ops.metricCpu'), mem: t('ops.metricMem'), disk: t('ops.metricDisk'), load: t('ops.metricLoad') }[m]
}

function toggleWatch() {
  if (store.watching) store.stopWatch()
  else store.startWatch(props.sessionId, props.serverId, props.serverName, 10000)
}

function markRead() { if (store.unreadCount > 0) store.markAllRead() }

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 离开面板不停止监控（后台继续），仅组件卸载时如未在监控则无操作
onUnmounted(() => { /* keep watching in background */ })
</script>

<style lang="scss" scoped>
.alerts-panel { flex: 1; display: flex; overflow: hidden; min-height: 0; }

// 左侧配置
.ap-config { width: 280px; flex-shrink: 0; border-right: 1px solid $color-border-light; padding: $spacing-md; overflow-y: auto; display: flex; flex-direction: column; gap: $spacing-sm; }
.ap-section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }

.ap-rule { padding: $spacing-sm; border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border; }
.ap-rule-head { display: flex; align-items: center; gap: 8px; }
.ap-rule-name { font-size: $font-size-sm; color: $color-text-primary; flex: 1; }
.ap-rule-sev { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 3px;
  &.critical { color: $color-danger; background: $color-bg-danger-hover; }
  &.warning { color: $color-warning; background: $color-bg-warning-hover; }
}
.ap-rule-body { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.ap-op { font-family: $font-family-mono; color: $color-text-secondary; }
.ap-slider { flex: 1; }
.ap-val { font-size: $font-size-sm; font-family: $font-family-mono; color: $color-primary; width: 36px; text-align: right; }
.ap-load-hint { font-size: $font-size-xs; color: $color-text-placeholder; margin-top: 4px; }

.ap-watch { margin-top: $spacing-sm; }
.ap-live { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.ap-live-badge { font-size: 9px; font-weight: 700; color: $color-success; background: $color-bg-success-hover; padding: 1px 6px; border-radius: 3px; animation: glow-pulse 2s ease-in-out infinite; }
.ap-live-metric { font-size: 10px; font-family: $font-family-mono; color: $color-text-secondary; }

// 右侧时间线
.ap-timeline { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; }
.ap-timeline-head { display: flex; align-items: center; justify-content: space-between; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; }
.ap-events { flex: 1; overflow-y: auto; padding: $spacing-sm; display: flex; flex-direction: column; gap: 4px; min-height: 0; }
.ap-no-events { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: $color-text-placeholder; padding: $spacing-xl;
  .el-icon { opacity: 0.4; }
}
.ap-event {
  display: flex; align-items: flex-start; gap: 8px; padding: 8px 12px; border-radius: $border-radius-md;
  background: $glass-bg; border: 1px solid $glass-border; border-left-width: 3px;
  animation: fade-in-up 0.25s ease;
  &.critical { border-left-color: $color-danger; } &.warning { border-left-color: $color-warning; }
  &.unread { box-shadow: $glow-soft; }
}
.ap-ev-dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; flex-shrink: 0;
  &.critical { background: $color-danger; } &.warning { background: $color-warning; }
}
.ap-ev-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ap-ev-msg { font-size: $font-size-xs; color: $color-text-regular; }
.ap-ev-server { font-weight: 600; color: $color-text-primary; }
.ap-ev-time { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }
</style>
