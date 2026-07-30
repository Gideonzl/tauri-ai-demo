<!-- AlertsPanel — 实时告警监控 -->
<template>
  <div class="alerts-panel">
    <!-- 左：阈值规则 + 监控开关 -->
    <div class="ap-config">
      <div class="ap-config-heading">
        <div>
          <div class="ap-section-title">{{ t('ops.alertRules') }}</div>
          <p class="ap-section-hint">{{ t('ops.alertRuleHint') }}</p>
        </div>
        <span class="ap-watch-state" :class="{ active: store.watching }">
          <i></i>{{ store.watching ? t('ops.watching') : t('monitor.idle') }}
        </span>
      </div>
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
        <div class="ap-timeline-title">
          <span class="ap-section-title">{{ t('ops.alertHistory') }}</span>
          <span v-if="store.events.length" class="ap-event-count">{{ store.events.length }}</span>
          <span v-if="store.unreadCount" class="ap-unread-count">{{ store.unreadCount }} {{ t('ops.unreadAlerts') }}</span>
        </div>
        <div v-if="store.events.length" class="ap-timeline-actions">
          <el-button v-if="store.unreadCount" size="small" text @click="store.markAllRead()">
            <el-icon :size="13"><CircleCheck /></el-icon>{{ t('ops.markAllRead') }}
          </el-button>
          <el-button size="small" text class="ap-clear" @click="store.clearEvents()">
            <el-icon :size="13"><Delete /></el-icon>{{ t('ops.clearAlerts') }}
          </el-button>
        </div>
      </div>
      <div class="ap-events" @scroll="markRead">
        <div v-if="store.events.length === 0" class="ap-no-events">
          <el-icon :size="30"><CircleCheckFilled /></el-icon>
          <span>{{ t('ops.noAlerts') }}</span>
          <small>{{ t('ops.alertEmptyHint') }}</small>
        </div>
        <div v-for="ev in store.events" :key="ev.id" class="ap-event" :class="[ev.severity, { unread: !ev.read }]">
          <div class="ap-ev-icon" :class="ev.severity">
            <el-icon :size="15"><WarningFilled /></el-icon>
          </div>
          <div class="ap-ev-body">
            <div class="ap-ev-topline">
              <span class="ap-ev-server">{{ ev.serverName }}</span>
              <span class="ap-ev-severity" :class="ev.severity">{{ severityLabel(ev.severity) }}</span>
              <span v-if="!ev.read" class="ap-ev-unread" :title="t('ops.unreadAlerts')"></span>
            </div>
            <div class="ap-ev-msg">
              {{ eventMessage(ev) }}
            </div>
            <div class="ap-ev-footer">
              <span class="ap-ev-time">{{ formatTime(ev.ts) }}</span>
              <span class="ap-ev-threshold">{{ t('ops.alertThreshold') }} {{ thresholdLabel(ev) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted } from 'vue'
import { VideoPlay, VideoPause, CircleCheck, CircleCheckFilled, Delete, WarningFilled } from '@element-plus/icons-vue'
import { useAlertStore } from '@/stores/alerts'
import type { AlertEvent, AlertMetric, Severity } from '@/stores/alerts'
import { useLocale } from '@/composables/useLocale'

const props = defineProps<{ sessionId: string; serverName: string; serverId: string }>()

const store = useAlertStore()
const { t } = useLocale()

const liveSample = computed(() => store.currentSample)

function metricLabel(m: AlertMetric): string {
  return { cpu: t('ops.metricCpu'), mem: t('ops.metricMem'), disk: t('ops.metricDisk'), load: t('ops.metricLoad'), script: t('ops.metricScript') }[m]
}

function severityLabel(severity: Severity): string {
  return severity === 'critical' ? t('ops.sevCritical') : t('ops.sevWarning')
}

function valueLabel(ev: AlertEvent): string { return ev.metric === 'script' ? t('ops.failureCount', { n: ev.value }) : `${ev.value}${ev.metric === 'load' ? '' : '%'}` }
function thresholdLabel(ev: AlertEvent): string { return ev.metric === 'script' ? t('ops.failureCount', { n: ev.threshold }) : `${ev.threshold}${ev.metric === 'load' ? '' : '%'}` }
function eventMessage(ev: AlertEvent): string {
  if (ev.metric === 'script') return t('ops.scriptScheduleFailure', { n: ev.value })
  return t('ops.alertTriggered', { metric: metricLabel(ev.metric), value: valueLabel(ev), threshold: thresholdLabel(ev) })
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
.alerts-panel { flex: 1; display: flex; overflow: hidden; min-height: 0; background: $shell-workspace-bg; }

// 左侧配置
.ap-config { width: 280px; flex-shrink: 0; border-right: 1px solid $color-border-light; padding: $spacing-md; overflow-y: auto; display: flex; flex-direction: column; gap: $spacing-sm; background: $color-bg-surface; }
.ap-config-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; padding-bottom: 4px; }
.ap-section-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }
.ap-section-hint { margin: 4px 0 0; font-size: 10px; line-height: 1.45; color: $color-text-placeholder; }
.ap-watch-state { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; font-size: 9px; color: $color-text-muted;
  i { width: 6px; height: 6px; border-radius: 50%; background: $color-text-muted; }
  &.active { color: $color-success; i { background: $color-success; box-shadow: 0 0 0 3px $color-bg-success-hover; } }
}

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
.ap-timeline-head { display: flex; align-items: center; justify-content: space-between; gap: $spacing-sm; padding: 10px $spacing-md; border-bottom: 1px solid $color-border-light; background: $color-bg-surface; }
.ap-timeline-title, .ap-timeline-actions { display: flex; align-items: center; gap: 7px; min-width: 0; }
.ap-event-count, .ap-unread-count { display: inline-flex; align-items: center; border-radius: 10px; font-family: $font-family-mono; font-size: 10px; font-weight: 650; }
.ap-event-count { min-width: 20px; justify-content: center; padding: 1px 6px; color: $color-text-secondary; background: $color-bg-active; }
.ap-unread-count { padding: 1px 6px; color: $color-primary; background: $color-bg-active; }
.ap-timeline-actions .el-button { color: $color-text-regular; }
.ap-clear { color: $color-danger !important; }
.ap-events { flex: 1; overflow-y: auto; padding: $spacing-md; display: flex; flex-direction: column; gap: 7px; min-height: 0; }
.ap-no-events { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: $color-text-secondary; padding: $spacing-xl;
  .el-icon { color: $color-success; background: $color-bg-success-hover; padding: 12px; border-radius: 14px; }
  small { color: $color-text-placeholder; font-size: 10px; }
}
.ap-event {
  display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: $border-radius-md;
  background: $color-bg-hover; border: 1px solid $color-border-light; border-left: 3px solid $color-warning;
  animation: fade-in-up 0.25s ease;
  &.critical { border-left-color: $color-danger; } &.warning { border-left-color: $color-warning; }
  &.unread { background: $color-bg-active; border-color: $color-border; }
}
.ap-ev-icon { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 8px; flex-shrink: 0; color: $color-warning; background: $color-bg-warning-hover;
  &.critical { color: $color-danger; background: $color-bg-danger-hover; }
}
.ap-ev-body { flex: 1; display: flex; flex-direction: column; gap: 2px; }
.ap-ev-topline { display: flex; align-items: center; gap: 6px; min-width: 0; }
.ap-ev-msg { font-size: $font-size-xs; color: $color-text-regular; }
.ap-ev-server { font-weight: 600; color: $color-text-primary; }
.ap-ev-severity { font-size: 9px; font-weight: 650; padding: 1px 5px; border-radius: 4px; color: $color-warning; background: $color-bg-warning-hover;
  &.critical { color: $color-danger; background: $color-bg-danger-hover; }
}
.ap-ev-unread { width: 6px; height: 6px; border-radius: 50%; background: $color-primary; margin-left: auto; flex-shrink: 0; }
.ap-ev-footer { display: flex; align-items: center; gap: 8px; margin-top: 3px; }
.ap-ev-time, .ap-ev-threshold { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }
.ap-ev-threshold { color: $color-text-muted; }

@media (max-width: 860px) {
  .alerts-panel { flex-direction: column; }
  .ap-config { width: auto; max-height: 48%; border-right: 0; border-bottom: 1px solid $color-border-light; }
  .ap-timeline { min-height: 260px; }
}

@media (max-width: 520px) {
  .ap-timeline-head { align-items: flex-start; flex-direction: column; }
  .ap-timeline-actions { width: 100%; justify-content: flex-end; }
}
</style>
