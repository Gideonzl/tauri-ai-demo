<!-- LogPanel — 智能日志分析：拉取 + 高亮 + AI 根因分析 -->
<template>
  <div class="log-panel">
    <!-- 工具栏 -->
    <div class="lp-toolbar">
      <el-select v-model="sourceKey" size="small" :popper-append-to-body="false" style="width: 200px" @change="onSourceChange">
        <el-option v-for="s in sources" :key="s.key" :label="s.label" :value="s.key" />
      </el-select>
      <el-input v-if="sourceKey === 'custom'" v-model="customPath" size="small" :placeholder="t('ops.logPathPlaceholder')" class="lp-path" @keydown.enter="fetchLog" />
      <div class="lp-lines">
        <span class="lp-lines-label">{{ t('ops.logLines') }}</span>
        <el-select v-model="lines" size="small" :popper-append-to-body="false" style="width: 90px">
          <el-option v-for="n in [100, 200, 300, 500]" :key="n" :label="String(n)" :value="n" />
        </el-select>
      </div>
      <el-button type="primary" size="small" :loading="fetching" @click="fetchLog">
        <el-icon :size="13" v-if="!fetching"><Download /></el-icon>
        {{ fetching ? t('ops.logFetching') : t('ops.logFetch') }}
      </el-button>
      <div class="lp-spacer" />
      <el-button v-if="logText" size="small" type="primary" text :loading="aiRunning" @click="analyzeLog">
        <el-icon :size="13" v-if="!aiRunning"><ChatDotRound /></el-icon>
        {{ aiRunning ? t('ops.aiAnalyzing') : t('ops.logAnalyze') }}
      </el-button>
    </div>

    <div class="lp-body">
      <!-- 日志内容 -->
      <div class="lp-log" :class="{ narrow: aiText }">
        <div v-if="!logText && !fetching" class="lp-empty">
          <el-icon :size="32"><Document /></el-icon>
          <p>{{ t('ops.logEmpty') }}</p>
        </div>
        <div v-else class="lp-lines-view">
          <div v-for="(line, i) in highlightedLines" :key="i" class="lp-line" :class="line.level" v-html="line.html"></div>
        </div>
      </div>

      <!-- AI 分析 -->
      <div v-if="aiText || aiRunning" class="lp-ai">
        <div class="lp-ai-head">{{ t('ops.aiReport') }}</div>
        <div class="lp-ai-body markdown-body" v-html="renderedAi"></div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Download, ChatDotRound, Document } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { sshExec } from '@/api/tauri'
import { streamChat } from '@/utils/ai-chat'
import { useModelStore } from '@/stores/model'
import { useLocale } from '@/composables/useLocale'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ sessionId: string; serverName: string }>()

const modelStore = useModelStore()
const { t } = useLocale()

const sources = [
  { key: 'syslog', label: 'syslog', cmd: (n: number) => `tail -n ${n} /var/log/syslog 2>/dev/null || tail -n ${n} /var/log/messages 2>/dev/null` },
  { key: 'auth', label: 'auth.log', cmd: (n: number) => `tail -n ${n} /var/log/auth.log 2>/dev/null || tail -n ${n} /var/log/secure 2>/dev/null` },
  { key: 'nginx-err', label: 'nginx error', cmd: (n: number) => `tail -n ${n} /var/log/nginx/error.log 2>/dev/null` },
  { key: 'nginx-acc', label: 'nginx access', cmd: (n: number) => `tail -n ${n} /var/log/nginx/access.log 2>/dev/null` },
  { key: 'journal', label: 'journalctl', cmd: (n: number) => `journalctl -n ${n} --no-pager 2>/dev/null` },
  { key: 'dmesg', label: 'dmesg', cmd: (n: number) => `dmesg 2>/dev/null | tail -n ${n}` },
  { key: 'custom', label: t('ops.logCustomPath'), cmd: (n: number) => `tail -n ${n} '${customPath.value.replace(/'/g, "'\\''")}' 2>/dev/null` },
]

const sourceKey = ref('syslog')
const customPath = ref('')
const lines = ref(200)
const fetching = ref(false)
const logText = ref('')

const aiRunning = ref(false)
const aiText = ref('')
const renderedAi = computed(() => renderMarkdown(aiText.value))

function onSourceChange() { logText.value = '' }

const ERROR_RE = /\b(error|fatal|critical|panic|denied|refused|exception|traceback|segfault|failed|failure)\b/i
const WARN_RE = /\b(warn|warning|deprecated|timeout|retry|unable)\b/i

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const highlightedLines = computed(() => {
  if (!logText.value) return []
  return logText.value.split('\n').map(line => {
    let level = ''
    if (ERROR_RE.test(line)) level = 'error'
    else if (WARN_RE.test(line)) level = 'warn'
    let html = escapeHtml(line)
    // 高亮关键词
    html = html.replace(ERROR_RE, m => `<span class="hl-err">${m}</span>`)
    html = html.replace(WARN_RE, m => `<span class="hl-warn">${m}</span>`)
    return { level, html: html || '&nbsp;' }
  })
})

async function fetchLog() {
  if (!props.sessionId) { ElMessage.warning(t('ops.noConnected')); return }
  const src = sources.find(s => s.key === sourceKey.value)
  if (!src) return
  if (sourceKey.value === 'custom' && !customPath.value.trim()) { ElMessage.warning(t('ops.logPathPlaceholder')); return }
  fetching.value = true
  aiText.value = ''
  try {
    const out = await sshExec(props.sessionId, src.cmd(lines.value))
    logText.value = out.trim() || ''
    if (!logText.value) ElMessage.info(t('ops.logEmpty'))
  } catch (e: any) {
    ElMessage.error(e?.message || String(e))
    logText.value = ''
  } finally {
    fetching.value = false
  }
}

async function analyzeLog() {
  if (!logText.value) return
  if (!modelStore.defaultConfig) { ElMessage.warning(t('ai.pleaseConfig')); return }
  aiRunning.value = true
  aiText.value = ''
  const prompt = `以下是服务器「${props.serverName}」的日志（最近 ${lines.value} 行）。请作为资深运维专家：\n1. 找出其中的错误、异常、告警；\n2. 定位可能的根因；\n3. 给出排查与修复建议。用简洁中文分点回答。\n\n\`\`\`log\n${logText.value.slice(0, 6000)}\n\`\`\``
  const agent = { id: 'ops-log', name: 'Log', description: '', systemPrompt: '你是一名资深 Linux 运维与故障排查专家，擅长从日志中定位问题根因。' }
  await streamChat(
    agent as any,
    [{ role: 'user', content: prompt }],
    (chunk) => { aiText.value += chunk },
    () => { aiRunning.value = false },
    (err) => { aiRunning.value = false; ElMessage.error(err) },
    { serverName: props.serverName, host: '', port: 22, username: '', status: 'connected' },
    null,
    undefined,
    'qa'
  )
}
</script>

<style lang="scss" scoped>
.log-panel { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 0; }

.lp-toolbar { display: flex; align-items: center; gap: $spacing-sm; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; flex-shrink: 0; }
.lp-path { width: 220px; }
.lp-lines { display: flex; align-items: center; gap: 5px;
  .lp-lines-label { font-size: $font-size-xs; color: $color-text-secondary; }
}
.lp-spacer { flex: 1; }

.lp-body { flex: 1; display: flex; overflow: hidden; min-height: 0; }
.lp-log { flex: 1; overflow: auto; padding: $spacing-sm $spacing-md; min-width: 0;
  &.narrow { flex: 1.4; border-right: 1px solid $color-border-light; }
}
.lp-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; color: $color-text-placeholder;
  .el-icon { opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
}
.lp-lines-view { font-family: $font-family-mono; font-size: $font-size-xs; line-height: 1.55; }
.lp-line {
  white-space: pre-wrap; word-break: break-all; padding: 0 6px; border-radius: 2px; color: $color-text-regular;
  &.error { background: rgba(212, 84, 84, 0.08); color: $color-text-primary; }
  &.warn { background: rgba(212, 162, 78, 0.06); }
  :deep(.hl-err) { color: $color-danger; font-weight: 700; }
  :deep(.hl-warn) { color: $color-warning; font-weight: 600; }
}

.lp-ai { flex: 1; display: flex; flex-direction: column; overflow: hidden; background: $glass-bg; }
.lp-ai-head { padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex-shrink: 0; }
.lp-ai-body { flex: 1; overflow-y: auto; padding: $spacing-md; font-size: $font-size-sm; line-height: 1.62; color: $color-text-primary; }
</style>
