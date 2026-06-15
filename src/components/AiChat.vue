/**
 * AI对话面板 — 右侧常驻面板
 * Termius极简风格 Markdown渲染 + 代码高亮 + Stop/Abort
 */
<template>
  <div class="ai-chat">
    <!-- 智能体切换栏 -->
    <div class="agent-bar">
      <AgentSwitch />
    </div>

    <!-- 快速分析按钮 -->
    <div class="quick-analysis-bar" v-if="quickAnalyses.length > 0">
      <el-button
        v-for="qa in quickAnalyses"
        :key="qa.id"
        size="small"
        text
        @click="handleQuickAnalysis(qa.prompt)"
      >
        {{ qa.label }}
      </el-button>
    </div>

    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef" @scroll="onScroll">
      <div v-if="messages.length === 0" class="empty-hint">
        <el-icon :size="32" class="empty-icon"><ChatDotRound /></el-icon>
        <p>{{ agentStore.activeAgent.name }}</p>
        <p class="sub">{{ agentStore.activeAgent.description }}</p>
        <p class="sub sub-hint">{{ t('ai.emptyHint') }}</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-item"
        :class="msg.role"
      >
        <div class="message-role">
          <span>{{ msg.role === 'user' ? t('ai.you') : t('ai.ai') }}</span>
          <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
        </div>
        <div class="message-body">
          <div
            class="message-content markdown-body"
            :ref="(el) => onMsgEl(msg.id, el)"
            v-html="renderMarkdown(msg.content)"
          ></div>
          <div v-if="msg.isStreaming" class="streaming-cursor">_</div>
          <div v-if="msg.error" class="message-error">{{ msg.error }}</div>
        </div>
      </div>

      <!-- 生成中指示器 -->
      <div v-if="chatStore.isGenerating" class="generating-bar">
        <span class="generating-dot" />
        {{ t('ai.think') }}
        <el-button size="small" type="danger" text @click="handleStop" style="margin-left:8px">{{ t('ai.stop') }}</el-button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        :placeholder="`${t('ai.send')} ${agentStore.activeAgent.name}...`"
        resize="none"
        @keydown.enter.exact.prevent="handleSend"
        :disabled="chatStore.isGenerating"
      />
      <div class="input-actions">
        <el-button
          size="small"
          @click="handleClear"
          :disabled="messages.length === 0"
          text
        >
          {{ t('ai.newChat') }}
        </el-button>
        <el-button
          :type="chatStore.isGenerating ? 'danger' : 'primary'"
          size="small"
          :disabled="!inputText.trim() && !chatStore.isGenerating"
          @click="chatStore.isGenerating ? handleStop() : handleSend()"
        >
          {{ chatStore.isGenerating ? t('ai.stop') : t('ai.send') }}
        </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useChatStore } from '@/stores/chat'
import { useModelStore } from '@/stores/model'
import { useLocale } from '@/composables/useLocale'
import { streamChat } from '@/utils/ai-chat'
import type { StreamControl } from '@/utils/ai-chat'
import { renderMarkdown, attachCopyButtons } from '@/utils/markdown'
import { ElMessage } from 'element-plus'
import { ChatDotRound } from '@element-plus/icons-vue'
import AgentSwitch from '@/components/AgentSwitch.vue'

const agentStore = useAgentStore()
const chatStore = useChatStore()
const modelStore = useModelStore()
const { t } = useLocale()

const inputText = ref('')
const messageListRef = ref<HTMLElement>()
const userScrolledUp = ref(false)
let currentStream: StreamControl | null = null

/** 快速分析预设 — labels 随 locale 变化 */
const quickAnalyses = computed(() => [
  { id: 'health', label: t('quickAnalysis.systemHealth'), prompt: 'Please perform a system health check. Analyze CPU usage, memory usage, disk space, and identify any potential issues. Suggest diagnostic commands first.' },
  { id: 'disk', label: t('quickAnalysis.diskUsage'), prompt: 'Analyze disk usage patterns. Identify large directories, potential cleanup targets, and space optimization strategies. Look for unusual growth patterns.' },
  { id: 'network', label: t('quickAnalysis.network'), prompt: 'Analyze network configuration, open ports, and active connections. Check for security concerns, unusual listening services, and firewall rules.' },
  { id: 'process', label: t('quickAnalysis.processes'), prompt: 'Analyze running processes. Identify resource hogs, zombie processes, unnecessary services, and any suspicious or unexpected processes.' },
  { id: 'security', label: t('quickAnalysis.security'), prompt: 'Perform a security assessment. Check authentication logs, sudo usage, failed login attempts, open ports, running services, file permissions on critical paths, and potential vulnerabilities.' },
])

// 跟踪已渲染的消息元素，用于在新 chunk 到达后给代码块加 copy 按钮
const renderedMsgs = new Map<string, HTMLElement>()

function onMsgEl(msgId: string, el: unknown) {
  const htmlEl = el as HTMLElement | null
  if (htmlEl && !renderedMsgs.has(msgId)) {
    renderedMsgs.set(msgId, htmlEl)
    attachCopyButtons(htmlEl)
  }
}

// 每次消息列表变化后，给新增的代码块附加 copy 按钮
watch(
  () => chatStore.getMessages(agentStore.activeAgentId).length,
  () => {
    nextTick(() => {
      renderedMsgs.forEach((el) => {
        if (el.querySelector('.code-block')) {
          attachCopyButtons(el)
        }
      })
    })
  }
)

/**
 * 注入远端文件路径到AI对话
 */
function injectFilePath(filePath: string, fileType: 'file' | 'directory', serverInfo?: string) {
  chatStore.injectFilePathToChat(agentStore.activeAgentId, filePath, fileType, serverInfo)
  scrollToBottom()
}

/**
 * 注入远端文件内容到AI对话
 */
function injectFileContent(filePath: string, content: string, serverInfo?: string) {
  chatStore.injectFileContentToChat(agentStore.activeAgentId, filePath, content, serverInfo)
  scrollToBottom()
}

/**
 * 注入终端文本到AI对话
 */
function injectTerminalText(text: string, serverInfo?: string) {
  const header = serverInfo
    ? `${t('ai.terminalHeaderFrom')} ${serverInfo}:\n`
    : `${t('ai.terminalHeader')}:\n`
  chatStore.addUserMessage(
    agentStore.activeAgentId,
    `${header}\n\`\`\`shell\n${text}\n\`\`\`\n${t('ai.analyzeOutput')}`
  )
  agentStore.switchAgent('ops')
  scrollToBottom()
}

defineExpose({ injectFilePath, injectFileContent, injectTerminalText })

const messages = computed(() => chatStore.getMessages(agentStore.activeAgentId))

/** 格式化时间戳为相对时间 */
function formatTime(ts: number): string {
  if (!ts) return ''
  const delta = Date.now() - ts
  if (delta < 60000) return t('common.justNow')
  if (delta < 3600000) return t('common.minutesAgo', { n: Math.floor(delta / 60000) })
  if (delta < 86400000) return t('common.hoursAgo', { n: Math.floor(delta / 3600000) })
  return t('common.daysAgo', { n: Math.floor(delta / 86400000) })
}

function scrollToBottom() {
  if (userScrolledUp.value) return
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

function onScroll() {
  if (!messageListRef.value) return
  const el = messageListRef.value
  userScrolledUp.value = el.scrollTop + el.clientHeight < el.scrollHeight - 60
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return
  }
  if (chatStore.isGenerating) return

  chatStore.addUserMessage(agentStore.activeAgentId, text)
  inputText.value = ''
  userScrolledUp.value = false
  scrollToBottom()
  chatStore.startStreaming(agentStore.activeAgentId)

  const chatMessages = messages.value
    .filter(m => !m.isStreaming && !m.error)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  currentStream = await streamChat(
    agentStore.activeAgent,
    chatMessages,
    (chunk) => {
      chatStore.appendStreamingContent(chunk)
      scrollToBottom()
    },
    () => {
      chatStore.finishStreaming(agentStore.activeAgentId)
      currentStream = null
    },
    (error) => {
      chatStore.finishStreaming(agentStore.activeAgentId)
      currentStream = null
      ElMessage.error(error)
    }
  )
}

function handleStop() {
  if (currentStream) {
    currentStream.abort()
    currentStream = null
  }
  chatStore.finishStreaming(agentStore.activeAgentId)
}

function handleQuickAnalysis(prompt: string) {
  if (chatStore.isGenerating) return
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return
  }
  inputText.value = prompt
  handleSend()
}

function handleClear() {
  if (currentStream) {
    currentStream.abort()
    currentStream = null
  }
  chatStore.clearSession(agentStore.activeAgentId)
  inputText.value = ''
}
</script>

<style lang="scss" scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.agent-bar {
  padding: $spacing-xs $spacing-sm;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-md $spacing-md;
}

.empty-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: $spacing-xs;
  color: $color-text-secondary;

  .empty-icon { color: $color-text-muted; opacity: 0.4; }
  p { font-size: $font-size-sm; margin: 0; }
  .sub { font-size: $font-size-xs; color: $color-text-placeholder; }
  .sub-hint { margin-top: $spacing-sm; font-style: italic; }
}

.message-item {
  margin-bottom: $spacing-md;

  &.user {
    .message-role { color: $color-info; }
    .message-body { background-color: $color-bg-message-user; }
  }

  &.assistant {
    .message-role { color: $color-primary; }
    .message-body { background-color: $color-bg-message-ai; }
  }
}

.message-role {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-size-xs;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 2px;
}

.message-time {
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  color: $color-text-placeholder;
}

.message-body {
  padding: $spacing-sm $spacing-md;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
  line-height: 1.55;
  color: $color-text-primary;
}

.message-error {
  margin-top: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  font-size: $font-size-xs;
  color: $color-danger;
  background: rgba(224, 85, 85, 0.1);
  border-radius: 2px;
}

.quick-analysis-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: $spacing-xs $spacing-sm;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
}

.streaming-cursor {
  display: inline;
  animation: blink 0.6s step-end infinite;
  color: $color-primary;
}

@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.generating-bar {
  display: flex;
  align-items: center;
  padding: $spacing-xs 0;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.generating-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: $color-primary;
  margin-right: 6px;
  animation: blink 1s step-end infinite;
}

.input-area {
  padding: $spacing-sm $spacing-md;
  border-top: 1px solid $color-border-light;
  background-color: $color-bg-toolbar;
  flex-shrink: 0;
}

.input-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-xs;
  margin-top: $spacing-xs;
}
</style>

