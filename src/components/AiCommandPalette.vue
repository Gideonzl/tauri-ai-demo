<!-- AiCommandPalette — AI 命令助手：自然语言生成命令 / 命令解释 / 一键执行 -->
<template>
  <transition name="cp-fade">
    <div v-if="visible" class="cp-overlay" @click.self="close" @contextmenu.prevent>
      <div class="cp-panel">
        <!-- 顶部：助手身份与模式切换 -->
        <div class="cp-head">
          <div class="cp-brand">
            <el-icon :size="18" class="cp-logo"><MagicStick /></el-icon>
            <div>
              <strong>AI 命令助手</strong>
              <span>{{ mode === 'gen' ? '将运维需求转成安全命令' : '逐项解读 Shell 命令' }}</span>
            </div>
          </div>
          <div class="cp-modes">
            <button class="cp-mode" :class="{ active: mode === 'gen' }" @click="switchMode('gen')">{{ t('cmd.genMode') }}</button>
            <button class="cp-mode" :class="{ active: mode === 'explain' }" @click="switchMode('explain')">{{ t('cmd.explainMode') }}</button>
          </div>
          <span class="cp-kbd">Esc</span>
          <el-icon :size="14" class="cp-close" @click="close"><Close /></el-icon>
        </div>

        <div class="cp-body">
          <!-- 输入 -->
          <div class="cp-composer" :class="{ running }">
            <el-icon :size="18" class="cp-input-icon"><component :is="mode === 'gen' ? ChatLineRound : Document" /></el-icon>
            <textarea
              ref="inputRef"
              v-model="input"
              class="cp-input"
              :placeholder="mode === 'gen' ? t('cmd.genPlaceholder') : t('cmd.explainPlaceholder')"
              rows="3"
              @keydown.enter.exact.prevent="submit"
            ></textarea>
            <div class="cp-composer-foot">
              <span><kbd>Enter</kbd> {{ mode === 'gen' ? '生成命令' : '开始解释' }} · <kbd>Shift + Enter</kbd> 换行</span>
              <el-button type="primary" class="cp-submit" :loading="running" :disabled="!input.trim() || running" @click="submit">
                {{ running ? t('cmd.thinking') : (mode === 'gen' ? t('cmd.generate') : t('cmd.explain')) }}
              </el-button>
            </div>
          </div>

        <!-- 快捷示例（生成模式，未有结果时） -->
          <div v-if="mode === 'gen' && !output && !running" class="cp-examples">
            <span class="cp-ex-label">{{ t('cmd.examples') }}</span>
            <button v-for="ex in examples" :key="ex" class="cp-ex" @click="input = ex; submit()">{{ ex }}</button>
          </div>

        <!-- 结果 -->
          <div v-if="output || running" class="cp-result">
          <!-- 生成模式：提取的命令卡 -->
          <div v-if="mode === 'gen' && extractedCmd" class="cp-cmd-card">
            <div class="cp-cmd-top">
              <span class="cp-cmd-label">{{ t('cmd.command') }}</span>
              <span class="cp-safety" :class="safety.level">{{ safety.icon }} {{ safety.text }}</span>
            </div>
            <pre class="cp-cmd-code">{{ extractedCmd }}</pre>
            <div class="cp-cmd-actions">
              <el-button size="small" @click="copyCmd"><el-icon :size="13"><CopyDocument /></el-icon>{{ t('cmd.copy') }}</el-button>
              <el-button size="small" type="primary" :disabled="!canRun" :loading="execRunning" @click="runOnServer">
                <el-icon :size="13" v-if="!execRunning"><VideoPlay /></el-icon>{{ t('cmd.runServer') }}
              </el-button>
              <span v-if="!canRun" class="cp-norun">{{ t('cmd.needConnect') }}</span>
              <span v-else class="cp-target">{{ activeServerName }}</span>
            </div>
          </div>

          <!-- AI 文本说明 -->
          <div class="cp-ai markdown-body" v-html="renderedOutput"></div>

          <!-- 执行输出 -->
          <div v-if="execOutput !== null" class="cp-exec">
            <div class="cp-exec-head">{{ t('cmd.output') }} · {{ activeServerName }}</div>
            <pre class="cp-exec-body">{{ execOutput || t('cmd.noOutput') }}</pre>
          </div>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { MagicStick, Close, ChatLineRound, Document, CopyDocument, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { useModelStore } from '@/stores/model'
import { streamChat } from '@/utils/ai-chat'
import { useLocale } from '@/composables/useLocale'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [boolean] }>()

const sshStore = useSshStore()
const modelStore = useModelStore()
const { t } = useLocale()

const visible = computed({ get: () => props.modelValue, set: (v) => emit('update:modelValue', v) })

const mode = ref<'gen' | 'explain'>('gen')
const input = ref('')
const output = ref('')
const running = ref(false)
const execOutput = ref<string | null>(null)
const execRunning = ref(false)
const inputRef = ref<HTMLTextAreaElement>()

const examples = [
  '找出占用内存最多的 10 个进程',
  '清理 7 天前的日志文件',
  '查看当前监听的所有端口',
  '统计当前目录各文件夹大小',
]

const renderedOutput = computed(() => renderMarkdown(output.value))

// 从 AI 输出提取第一个代码块中的命令
const extractedCmd = computed(() => {
  const m = output.value.match(/```(?:bash|sh|shell)?\s*\n([\s\S]*?)```/)
  if (m) return m[1].trim()
  return ''
})

// 安全等级（客户端正则判定）
const DANGER = /\b(rm\s+-rf|mkfs|dd\s+if=|reboot|shutdown|halt|iptables\s+-F|drop\s+(database|table)|>\s*\/dev\/(sd|nvme)|:\(\)\s*\{)/i
const CAUTION = /\b(sudo|rm\s|kill|pkill|systemctl\s+(stop|restart|disable)|chmod|chown|mv\s|truncate|>\s|tee\s|apt\s+(remove|purge)|yum\s+remove)/i
const safety = computed(() => {
  const c = extractedCmd.value
  if (!c) return { level: 'safe', icon: '✓', text: t('cmd.safeSafe') }
  if (DANGER.test(c)) return { level: 'danger', icon: '⛔', text: t('cmd.safeDanger') }
  if (CAUTION.test(c)) return { level: 'caution', icon: '⚠', text: t('cmd.safeCaution') }
  return { level: 'safe', icon: '✓', text: t('cmd.safeSafe') }
})

const activeServerName = computed(() => sshStore.activeSession?.serverName || '')
const canRun = computed(() => !!sshStore.activeSession?.realSessionId)

function switchMode(m: 'gen' | 'explain') {
  mode.value = m
  output.value = ''
  execOutput.value = null
  nextTick(() => inputRef.value?.focus())
}

function close() { visible.value = false }

// 打开时聚焦
watch(visible, (v) => {
  if (v) { execOutput.value = null; nextTick(() => inputRef.value?.focus()) }
})

// Esc 关闭
function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && visible.value) close() }
if (typeof window !== 'undefined') window.addEventListener('keydown', onKey)

async function submit() {
  const text = input.value.trim()
  if (!text || running.value) return
  if (!modelStore.defaultConfig) { ElMessage.warning(t('ai.pleaseConfig')); return }
  running.value = true
  output.value = ''
  execOutput.value = null

  const sys = mode.value === 'gen'
    ? '你是 Linux 命令行专家。用户用自然语言描述运维需求，你必须：1) 返回一条可直接执行的 shell 命令，放在 ```bash 代码块中；2) 代码块后用一到两句简洁中文说明该命令做什么。命令要安全、通用（尽量 POSIX 兼容），只给最合适的一条，不要罗列多个方案。'
    : '你是 Linux 命令行专家。用户给你一条 shell 命令，你用简洁中文解释：1) 它整体做什么；2) 关键参数的作用；3) 有无潜在风险。分点回答，不要执行任何操作。'
  const userMsg = mode.value === 'gen' ? text : `请解释这条命令：\n\`\`\`bash\n${text}\n\`\`\``

  const agent = { id: 'cmd-assistant', name: 'CmdAssistant', description: '', systemPrompt: sys }
  await streamChat(
    agent as any,
    [{ role: 'user', content: userMsg }],
    (chunk) => { output.value += chunk },
    () => { running.value = false },
    (err) => { running.value = false; ElMessage.error(err) },
    null, null, undefined, 'qa'
  )
}

function copyCmd() {
  if (!extractedCmd.value) return
  navigator.clipboard.writeText(extractedCmd.value)
  ElMessage.success(t('cmd.copied'))
}

async function runOnServer() {
  if (!extractedCmd.value || !canRun.value) return
  if (safety.value.level === 'danger') {
    try {
      const { ElMessageBox } = await import('element-plus')
      await ElMessageBox.confirm(t('cmd.dangerConfirm'), t('common.confirm'), { type: 'warning' })
    } catch { return }
  }
  execRunning.value = true
  execOutput.value = null
  try {
    const { sshExec } = await import('@/api/tauri')
    const out = await sshExec(sshStore.activeSession!.realSessionId!, extractedCmd.value)
    execOutput.value = out.trim()
  } catch (e: any) {
    execOutput.value = 'Error: ' + (e?.message || e)
  } finally {
    execRunning.value = false
  }
}
</script>

<style lang="scss" scoped>
.cp-overlay {
  position: fixed; inset: 0; z-index: 20000;
  display: flex; align-items: flex-start; justify-content: center;
  padding: min(11vh, 100px) 20px 24px;
  background: rgba(0, 0, 0, .42);
  backdrop-filter: blur(10px) saturate(.9);
}
.cp-panel {
  width: 760px; max-width: 100%; max-height: min(78vh, 720px);
  display: flex; flex-direction: column; overflow: hidden;
  background: $color-bg-surface; border: 1px solid $color-border;
  border-radius: 16px; box-shadow: $elevation-3;
  animation: cp-pop 0.2s ease;
}
@keyframes cp-pop { from { opacity: 0; transform: translateY(-12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }

.cp-head { display: flex; align-items: center; gap: 12px; padding: 13px 18px; border-bottom: 1px solid $color-border-light; flex-shrink: 0; }
.cp-brand { display: flex; align-items: center; gap: 10px; min-width: 188px;
  > div { display: flex; flex-direction: column; gap: 2px; }
  strong { font-size: $font-size-sm; color: $color-text-primary; letter-spacing: .01em; }
  span { font-size: 10px; color: $color-text-secondary; }
}
.cp-logo { color: $color-primary; padding: 8px; border-radius: 10px; background: $color-bg-active; }
.cp-modes { display: flex; gap: 3px; background: $color-bg-input; border: 1px solid $color-border-light; border-radius: 9px; padding: 3px; margin-left: auto; }
.cp-mode { padding: 6px 12px; border: none; background: transparent; cursor: pointer; font-family: inherit; font-size: $font-size-xs; color: $color-text-secondary; border-radius: 6px; transition: all $transition-fast;
  &:hover { color: $color-text-primary; background: $color-bg-hover; }
  &.active { background: $color-primary; color: #fff; box-shadow: 0 2px 6px rgba(0, 0, 0, .14); }
}
.cp-kbd { font-size: 10px; font-family: $font-family-mono; color: $color-text-muted; background: $color-bg-input; padding: 3px 7px; border-radius: 4px; }
.cp-close { cursor: pointer; color: $color-text-secondary; &:hover { color: $color-danger; } }

.cp-body { display: flex; flex-direction: column; min-height: 0; padding: 16px 18px 18px; }
.cp-composer { display: grid; grid-template-columns: auto 1fr; column-gap: 11px; padding: 13px 14px 10px; border: 1px solid $color-border; border-radius: 12px; background: $color-bg-input; transition: border-color $transition-fast, box-shadow $transition-fast;
  &:focus-within { border-color: $color-primary; box-shadow: 0 0 0 3px rgba(64, 158, 255, .14); }
  &.running { opacity: .8; }
}
.cp-input-icon { color: $color-primary; margin-top: 4px; flex-shrink: 0; }
.cp-input {
  width: 100%; min-height: 64px; border: none; outline: none; resize: none; background: transparent;
  color: $color-text-primary; font-size: $font-size-md; font-family: inherit; line-height: 1.55;
  &::placeholder { color: $color-text-placeholder; }
}
.cp-composer-foot { grid-column: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; color: $color-text-placeholder; font-size: 10px;
  kbd { font-family: $font-family-mono; font-size: 10px; color: $color-text-secondary; background: $color-bg-hover; border: 1px solid $color-border-light; border-radius: 3px; padding: 1px 4px; }
}
.cp-submit { flex-shrink: 0; min-width: 72px; }

.cp-examples { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; padding: 13px 2px 2px;
  .cp-ex-label { width: 100%; font-size: 10px; color: $color-text-placeholder; letter-spacing: .04em; text-transform: uppercase; }
}
.cp-ex { padding: 5px 10px; border: 1px solid $color-border; border-radius: 8px; background: transparent; cursor: pointer; font-family: inherit; font-size: $font-size-xs; color: $color-text-regular; transition: all $transition-fast;
  &:hover { border-color: $color-primary; color: $color-primary; background: $color-bg-active; }
}

.cp-result { flex: 1; overflow-y: auto; padding: 16px 0 0; min-height: 0;
  &::-webkit-scrollbar { width: 6px; } &::-webkit-scrollbar-thumb { background: $color-border; border-radius: 3px; }
}

.cp-cmd-card { border-radius: 12px; background: $color-bg-app; border: 1px solid $color-border; overflow: hidden; margin-bottom: 14px; }
.cp-cmd-top { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid $color-border-light;
  .cp-cmd-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }
}
.cp-safety { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 10px;
  &.safe { color: $color-success; background: $color-bg-success-hover; }
  &.caution { color: $color-warning; background: $color-bg-warning-hover; }
  &.danger { color: $color-danger; background: $color-bg-danger-hover; }
}
.cp-cmd-code { margin: 0; padding: 12px; font-family: $font-family-mono; font-size: $font-size-sm; color: $color-primary-light; white-space: pre-wrap; word-break: break-all; background: $color-bg-app; }
.cp-cmd-actions { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid $color-border-light;
  .cp-norun { font-size: 10px; color: $color-text-placeholder; }
  .cp-target { font-size: 10px; color: $color-success; font-family: $font-family-mono; margin-left: auto; }
}

.cp-ai { font-size: $font-size-sm; line-height: 1.6; color: $color-text-regular; }

.cp-exec { margin-top: 12px; border-radius: $border-radius-md; background: $color-bg-app; border: 1px solid $color-border; overflow: hidden; }
.cp-exec-head { padding: 6px 12px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; border-bottom: 1px solid $color-border-light; background: $color-bg-surface; }
.cp-exec-body { margin: 0; padding: 12px; font-family: $font-family-mono; font-size: $font-size-xs; line-height: 1.5; color: $color-text-regular; white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow-y: auto; }

.cp-fade-enter-active, .cp-fade-leave-active { transition: opacity 0.2s ease; }
.cp-fade-enter-from, .cp-fade-leave-to { opacity: 0; }

@media (max-width: 640px) {
  .cp-overlay { padding: 24px 12px; }
  .cp-head { flex-wrap: wrap; }
  .cp-brand { min-width: 0; flex: 1; }
  .cp-modes { order: 3; width: 100%; margin-left: 0; }
  .cp-mode { flex: 1; }
  .cp-composer-foot > span { display: none; }
}
</style>
