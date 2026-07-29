<!-- InspectionPanel — 一键智能巡检报告 -->
<template>
  <div class="inspect-panel">
    <!-- 操作栏 -->
    <div class="ip-actionbar">
      <el-button type="primary" size="small" :loading="store.running" @click="doInspect">
        <el-icon :size="13" v-if="!store.running"><VideoPlay /></el-icon>
        {{ store.running ? t('ops.inspecting') : t('ops.runInspection') }}
      </el-button>
      <span v-if="report" class="ip-time">{{ t('ops.lastInspect') }}: {{ formatTime(report.timestamp) }}</span>
      <div class="ip-spacer" />
      <el-button v-if="report" size="small" @click="doExport">
        <el-icon :size="13"><DocumentCopy /></el-icon>{{ t('ops.exportReport') }}
      </el-button>
    </div>

    <div class="ip-scroll" v-if="report">
      <!-- 健康分 + 概要 -->
      <div class="ip-hero">
        <div class="health-gauge">
          <svg viewBox="0 0 120 120" class="gauge-svg">
            <circle cx="60" cy="60" r="50" fill="none" stroke="var(--color-border, rgba(255,255,255,0.1))" stroke-width="9" />
            <circle cx="60" cy="60" r="50" fill="none" :stroke="scoreColor" stroke-width="9" stroke-linecap="round"
              :stroke-dasharray="gaugeDash" transform="rotate(-90 60 60)" class="gauge-fill" />
            <text x="60" y="56" text-anchor="middle" class="gauge-score" :style="{ fill: scoreColor }">{{ report.healthScore }}</text>
            <text x="60" y="74" text-anchor="middle" class="gauge-label">{{ t('ops.healthScore') }}</text>
          </svg>
          <div class="health-verdict" :class="verdictClass">{{ verdictText }}</div>
        </div>
        <div class="ip-summary-counts">
          <div class="count-item critical"><span class="cnum">{{ counts.critical }}</span><span class="clabel">{{ t('ops.sevCritical') }}</span></div>
          <div class="count-item warning"><span class="cnum">{{ counts.warning }}</span><span class="clabel">{{ t('ops.sevWarning') }}</span></div>
          <div class="count-item ok"><span class="cnum">{{ report.findings.length === 0 ? '✓' : report.findings.length }}</span><span class="clabel">{{ t('ops.findings') }}</span></div>
        </div>
      </div>

      <!-- findings -->
      <div v-if="report.findings.length === 0" class="ip-nofindings">
        <el-icon :size="24"><CircleCheck /></el-icon>
        <span>{{ t('ops.noFindings') }}</span>
      </div>
      <div v-else class="ip-findings">
        <div v-for="f in sortedFindings" :key="f.id" class="finding-card" :class="f.severity">
          <div class="finding-head">
            <span class="sev-dot" :class="f.severity"></span>
            <span class="finding-title">{{ f.title }}</span>
            <span v-if="f.value" class="finding-value" :class="f.severity">{{ f.value }}</span>
          </div>
          <div class="finding-detail">{{ f.detail }}</div>
          <div v-if="f.suggestion" class="finding-suggestion">
            <el-icon :size="11"><MagicStick /></el-icon>
            <span>{{ f.suggestion }}</span>
          </div>
        </div>
      </div>

      <!-- AI 分析 -->
      <div class="ip-ai-section">
        <div class="ip-ai-head">
          <span class="ip-ai-title">{{ t('ops.aiReport') }}</span>
          <el-button class="ip-ai-analyze" size="small" type="primary" :loading="aiRunning" :disabled="aiRunning" @click="doAiAnalyze">
            <el-icon :size="13" v-if="!aiRunning"><ChatDotRound /></el-icon>
            {{ aiRunning ? t('ops.aiAnalyzing') : t('ops.aiAnalyze') }}
          </el-button>
        </div>
        <div v-if="aiText" class="ip-ai-body markdown-body" v-html="renderedAi"></div>
        <div v-else-if="!aiRunning" class="ip-ai-empty">{{ t('ai.emptyHint') }}</div>
      </div>
    </div>

    <div v-else class="ip-placeholder">
      <el-icon :size="40"><DataLine /></el-icon>
      <p>{{ t('ops.runInspection') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { VideoPlay, DocumentCopy, CircleCheck, MagicStick, ChatDotRound, DataLine } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useInspectionStore } from '@/stores/inspection'
import type { InspectionReport } from '@/stores/inspection'
import { streamChat } from '@/utils/ai-chat'
import { useModelStore } from '@/stores/model'
import { useLocale } from '@/composables/useLocale'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ sessionId: string; serverName: string; serverId: string }>()

const store = useInspectionStore()
const modelStore = useModelStore()
const { t } = useLocale()

const report = computed<InspectionReport | null>(() => store.report)

const aiRunning = ref(false)
const aiText = ref('')
const renderedAi = computed(() => renderMarkdown(aiText.value))

const counts = computed(() => ({
  critical: report.value?.findings.filter(f => f.severity === 'critical').length || 0,
  warning: report.value?.findings.filter(f => f.severity === 'warning').length || 0,
}))

const sevOrder: Record<string, number> = { critical: 0, warning: 1, info: 2, ok: 3 }
const sortedFindings = computed(() => [...(report.value?.findings || [])].sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]))

const scoreColor = computed(() => {
  const s = report.value?.healthScore ?? 100
  if (s >= 85) return 'var(--color-success, #4caf7d)'
  if (s >= 60) return 'var(--chart-cpu-warning, #e69138)'
  return 'var(--color-danger, #d45454)'
})
const gaugeDash = computed(() => {
  const s = report.value?.healthScore ?? 0
  const c = 2 * Math.PI * 50
  return `${(s / 100) * c} ${c}`
})
const verdictClass = computed(() => {
  const s = report.value?.healthScore ?? 100
  return s >= 85 ? 'ok' : s >= 60 ? 'warn' : 'crit'
})
const verdictText = computed(() => {
  const s = report.value?.healthScore ?? 100
  return s >= 85 ? t('ops.healthy') : s >= 60 ? t('ops.attention') : t('ops.critical')
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

async function doInspect() {
  aiText.value = ''
  await store.runInspection(props.sessionId, props.serverName, props.serverId)
}

function doExport() {
  if (!report.value) return
  navigator.clipboard.writeText(store.exportMarkdown(report.value))
  ElMessage.success(t('ops.reportCopied'))
}

async function doAiAnalyze() {
  if (!report.value) return
  if (!modelStore.defaultConfig) { ElMessage.warning(t('ai.pleaseConfig')); return }
  aiRunning.value = true
  aiText.value = ''
  const prompt = store.buildAiPrompt(report.value)
  const agent = { id: 'ops-inspect', name: 'Inspection', description: '', systemPrompt: '你是一名资深 Linux 运维专家，负责解读服务器巡检结果并给出可执行的处置建议。' }
  await streamChat(
    agent as any,
    [{ role: 'user', content: prompt }],
    (chunk) => { aiText.value += chunk },
    () => { aiRunning.value = false; if (store.report) { store.report.aiSummary = aiText.value; store.saveReport() } },
    (err) => { aiRunning.value = false; ElMessage.error(err) },
    { serverName: props.serverName, host: '', port: 22, username: '', status: 'connected' },
    null,
    undefined,
    'qa'
  )
}
</script>

<style lang="scss" scoped>
.inspect-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; min-height: 0; }

.ip-actionbar {
  display: flex; align-items: center; gap: $spacing-md;
  padding: $spacing-sm $spacing-md; flex-shrink: 0;
  border-bottom: 1px solid $color-border-light;
  .ip-time { font-size: $font-size-xs; color: $color-text-placeholder; font-family: $font-family-mono; }
  .ip-spacer { flex: 1; }
}

.ip-scroll { flex: 1; overflow-y: auto; padding: $spacing-md; display: flex; flex-direction: column; gap: $spacing-md; min-height: 0; }
.ip-scroll > * { flex-shrink: 0; }

// ── Hero ──
.ip-hero {
  display: flex; align-items: center; gap: $spacing-xl;
  padding: $spacing-lg; border-radius: $border-radius-lg;
  background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1;
  animation: fade-in-up 0.3s ease;
}
.health-gauge { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.gauge-svg { width: 128px; height: 128px; }
.gauge-fill { transition: stroke-dasharray 0.8s ease; filter: drop-shadow(0 0 5px rgba(91,141,239,0.3)); }
.gauge-score { font-size: 32px; font-weight: 800; font-family: $font-family-mono; }
.gauge-label { font-size: 10px; fill: $color-text-secondary; text-transform: uppercase; letter-spacing: 1px; }
.health-verdict { font-size: $font-size-md; font-weight: 700;
  &.ok { color: $color-success; } &.warn { color: $color-warning; } &.crit { color: $color-danger; }
}

.ip-summary-counts { display: flex; gap: $spacing-lg; }
.count-item { display: flex; flex-direction: column; align-items: center; gap: 2px;
  .cnum { font-size: 26px; font-weight: 700; font-family: $font-family-mono; }
  .clabel { font-size: 10px; color: $color-text-secondary; text-transform: uppercase; letter-spacing: 0.5px; }
  &.critical .cnum { color: $color-danger; }
  &.warning .cnum { color: $color-warning; }
  &.ok .cnum { color: $color-success; }
}

// ── No findings ──
.ip-nofindings {
  display: flex; align-items: center; gap: 10px; justify-content: center;
  padding: $spacing-lg; border-radius: $border-radius-md;
  background: $color-bg-success-hover; color: $color-success; font-size: $font-size-sm;
}

// ── Findings ──
.ip-findings { display: flex; flex-direction: column; gap: $spacing-sm; }
.finding-card {
  padding: $spacing-sm $spacing-md; border-radius: $border-radius-md;
  background: $glass-bg; border: 1px solid $glass-border; border-left-width: 3px;
  box-shadow: $elevation-1; animation: fade-in-up 0.25s ease;
  &.critical { border-left-color: $color-danger; }
  &.warning { border-left-color: $color-warning; }
  &.info { border-left-color: $color-info; }
  &.ok { border-left-color: $color-success; }
}
.finding-head { display: flex; align-items: center; gap: 8px; }
.sev-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  &.critical { background: $color-danger; } &.warning { background: $color-warning; }
  &.info { background: $color-info; } &.ok { background: $color-success; }
}
.finding-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex: 1; }
.finding-value { font-size: $font-size-sm; font-weight: 700; font-family: $font-family-mono;
  &.critical { color: $color-danger; } &.warning { color: $color-warning; }
}
.finding-detail { font-size: $font-size-xs; color: $color-text-secondary; margin-top: 3px; font-family: $font-family-mono; }
.finding-suggestion {
  display: flex; align-items: flex-start; gap: 5px; margin-top: 6px;
  font-size: $font-size-xs; color: $color-primary-light;
  .el-icon { margin-top: 2px; flex-shrink: 0; }
}

// ── AI section ──
.ip-ai-section {
  border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border;
  box-shadow: $elevation-1; overflow: hidden;
}
.ip-ai-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light;
  .ip-ai-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; }
}
.ip-ai-analyze {
  // Do not inherit Element Plus's low-contrast text-button colors here: this
  // action is intentionally a solid primary control in every theme.
  color: $color-on-primary !important;
  background: $gradient-primary !important;
  border-color: transparent !important;

  &:hover,
  &:focus-visible {
    color: $color-on-primary !important;
    background: $gradient-primary !important;
  }
}
.ip-ai-body { padding: $spacing-md; font-size: $font-size-sm; line-height: 1.62; color: $color-text-primary; max-height: 46vh; overflow-y: auto;
  &::-webkit-scrollbar { width: 6px; } &::-webkit-scrollbar-thumb { background: $color-border; border-radius: 3px; }
}
.ip-ai-empty { padding: $spacing-md; font-size: $font-size-xs; color: $color-text-placeholder; }

.ip-placeholder {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; }
  p { margin: 0; font-size: $font-size-sm; }
}
</style>
