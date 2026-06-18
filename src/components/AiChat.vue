/**
 * AI对话面板 — 右侧常驻面板
 * Termius极简风格 Markdown渲染 + 代码高亮 + Stop/Abort
 */
<template>
  <div class="ai-chat" @contextmenu.prevent>
    <!-- 智能体切换栏 + 历史按钮 -->
    <div class="agent-bar">
      <AgentSwitch />
      <div class="agent-bar-actions">
        <el-button
          size="small"
          text
          :class="{ active: showHistory }"
          @click="showHistory = !showHistory"
          :title="t('ai.history')"
        >
          <el-icon :size="14"><Clock /></el-icon>
          <span v-if="historyCount > 0" class="history-count">{{ historyCount }}</span>
        </el-button>
      </div>
    </div>

    <!-- 当前服务器上下文指示器 -->
    <div v-if="serverContext && serverContext.status === 'connected'" class="server-context-bar">
      <el-icon :size="12"><Monitor /></el-icon>
      <span class="ctx-server-name">{{ serverContext.serverName }}</span>
      <span class="ctx-sep">|</span>
      <span class="ctx-addr">{{ serverContext.username }}@{{ serverContext.host }}:{{ serverContext.port }}</span>
      <span class="ctx-badge connected">{{ t('ai.connected') }}</span>
    </div>

    <!-- 对话标题栏 -->
    <div v-if="activeConv" class="conv-title-bar" @dblclick="handleRenameConv">
      <el-icon :size="12"><ChatDotRound /></el-icon>
      <span class="conv-title">{{ activeConv.title }}</span>
      <span class="conv-meta">{{ activeConv.messages.length }} {{ t('ai.messages') }}</span>
    </div>

    <!-- 历史对话面板 -->
    <div v-if="showHistory" class="conv-history-panel">
      <div class="history-header">
        <span class="history-label">{{ t('ai.history') }}</span>
        <el-button size="small" text @click="handleNewChat">
          <el-icon :size="12"><Plus /></el-icon>
          {{ t('ai.newChat') }}
        </el-button>
      </div>
      <div class="history-list" v-if="agentConversations.length > 0">
        <div
          v-for="conv in agentConversations"
          :key="conv.id"
          class="history-item"
          :class="{ active: conv.id === chatStore.activeConversationId }"
          @click="handleSwitchConv(conv.id)"
        >
          <div class="history-item-main">
            <span class="history-title">{{ conv.title }}</span>
            <span class="history-preview">{{ getPreview(conv) }}</span>
            <span class="history-time">{{ formatTime(conv.updatedAt) }}</span>
          </div>
          <el-button
            class="history-delete"
            size="small"
            text
            @click.stop="handleDeleteConv(conv.id)"
            :title="t('ai.deleteConversation')"
          >
            <el-icon :size="12"><Close /></el-icon>
          </el-button>
        </div>
      </div>
      <div v-else class="history-empty">
        <span>{{ t('ai.noHistory') }}</span>
      </div>
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
            @contextmenu.prevent="onMsgContextMenu($event, msg)"
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
        <div class="mode-select-wrapper">
          <el-select v-model="agentStore.activeMode" size="small" class="mode-select" popper-class="mode-select-popper" :popper-append-to-body="false">
            <el-option label="智能问答" value="qa">
              <span class="mode-opt"><span class="mode-opt-label">💬 智能问答</span><span class="mode-opt-desc">仅分析与建议</span></span>
            </el-option>
            <el-option label="智能体" value="agent">
              <span class="mode-opt"><span class="mode-opt-label">⚡ 智能体</span><span class="mode-opt-desc">可执行服务器命令</span></span>
            </el-option>
          </el-select>
        </div>
        <el-button
          size="small"
          @click="handleNewChat"
          text
        >
          <el-icon :size="12"><Plus /></el-icon>
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

    <!-- 消息右键菜单 — 复用全局 ctx-menu/ctx-item/ctx-sep 样式 -->
    <div v-if="msgMenu.visible" class="ctx-menu" :style="{ left: msgMenu.x + 'px', top: msgMenu.y + 'px' }">
      <div class="ctx-item" @click="msgMenuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
      <div class="ctx-item" @click="msgMenuAct('copyAll')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('common.copyMessage') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="msgMenuAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>{{ t('common.selectAll') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useChatStore } from '@/stores/chat'
import { useModelStore } from '@/stores/model'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { streamChat } from '@/utils/ai-chat'
import type { StreamControl, ServerContext } from '@/utils/ai-chat'
import type { Conversation } from '@/stores/chat'
import { renderMarkdown, attachCopyButtons } from '@/utils/markdown'
import { runDiagnostics, formatDiagnosticOutput } from '@/utils/server-diagnostics'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Monitor, Clock, Plus, Close, CopyDocument, DocumentCopy, Select } from '@element-plus/icons-vue'
import AgentSwitch from '@/components/AgentSwitch.vue'
import { useContextMenu } from '@/composables/useContextMenu'

const agentStore = useAgentStore()
const chatStore = useChatStore()
const modelStore = useModelStore()
const sshStore = useSshStore()
const { t } = useLocale()

const { register, unregister } = useContextMenu()
const showHistory = ref(false)

// 消息右键菜单
const msgMenu = reactive({ visible: false, x: 0, y: 0, msg: null as any })

function onMsgContextMenu(e: MouseEvent, msg: any) {
  msgMenu.msg = msg
  msgMenu.x = e.clientX
  msgMenu.y = e.clientY
  msgMenu.visible = true
}

function hideMsgMenu() { msgMenu.visible = false }

function msgMenuAct(action: string) {
  const msg = msgMenu.msg
  hideMsgMenu()
  if (!msg) return
  switch (action) {
    case 'copy': {
      const sel = window.getSelection()
      if (sel?.toString()) {
        navigator.clipboard.writeText(sel.toString()).then(() => ElMessage.success('Copied'))
      } else {
        navigator.clipboard.writeText(msg.content).then(() => ElMessage.success('Message copied'))
      }
      break
    }
    case 'copyAll':
      navigator.clipboard.writeText(msg.content).then(() => ElMessage.success('Message copied'))
      break
    case 'selectAll': {
      const el = renderedMsgs.get(msg.id)
      if (el) {
        const range = document.createRange()
        range.selectNodeContents(el)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
      break
    }
  }
}

const inputText = ref('')
const messageListRef = ref<HTMLElement>()
const userScrolledUp = ref(false)
let currentStream: StreamControl | null = null

/** Derive current server context from active SSH session */
const serverContext = computed<ServerContext | null>(() => {
  const session = sshStore.activeSession
  if (!session) return null
  const server = sshStore.servers.find((s: { id: string }) => s.id === session.serverId)
  if (!server) return null
  return {
    serverName: session.serverName,
    host: server.host,
    port: server.port,
    username: server.username,
    status: session.status,
  }
})

// Auto-switch to OPS agent when a server connects
watch(
  () => sshStore.activeSession?.status,
  (status) => {
    if (status === 'connected') {
      agentStore.switchAgent('ops')
    }
  }
)

/** Active conversation (current) */
const activeConv = computed(() => chatStore.activeConversation)

/** All non-empty conversations for the current agent, sorted by last update */
const agentConversations = computed(() => {
  return chatStore.conversations
    .filter((c: Conversation) => c.agentId === agentStore.activeAgentId && c.messages.length > 0)
    .sort((a: Conversation, b: Conversation) => b.updatedAt - a.updatedAt)
})

/** Number of past conversations for badge */
const historyCount = computed(() => agentConversations.value.length)

/** Get preview text from last message in conversation */
function getPreview(conv: { messages: Array<{ content: string }> }): string {
  const last = conv.messages[conv.messages.length - 1]
  if (!last) return ''
  const text = last.content.replace(/```[\s\S]*?```/g, '').replace(/[#*`>\[\]()!\n\r]/g, ' ').trim()
  return text.slice(0, 60) + (text.length > 60 ? '...' : '')
}

/** Switch to a conversation and close history panel */
function handleSwitchConv(id: string) {
  chatStore.switchConversation(id)
  showHistory.value = false
  userScrolledUp.value = false
  nextTick(() => scrollToBottom())
}

/** Delete a conversation */
function handleDeleteConv(id: string) {
  ElMessageBox.confirm(
    t('ai.confirmDeleteConv'),
    t('common.confirm'),
    { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  ).then(() => {
    chatStore.deleteConversation(id)
    ElMessage.success(t('ai.convDeleted'))
  }).catch(() => {})
}

/** Rename current conversation */
function handleRenameConv() {
  if (!activeConv.value) return
  ElMessageBox.prompt(
    t('ai.renameConversation'),
    t('common.confirm'),
    { inputValue: activeConv.value.title, confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }
  ).then((result: { value: string }) => {
    if (result.value && result.value.trim()) {
      chatStore.renameConversation(activeConv.value!.id, result.value.trim())
    }
  }).catch(() => {})
}

/** Create a new chat */
function handleNewChat() {
  if (currentStream) {
    currentStream.abort()
    currentStream = null
  }
  chatStore.clearSession(agentStore.activeAgentId)
  inputText.value = ''
  showHistory.value = false
  userScrolledUp.value = false
}

/** 快速分析预设 — labels 和 prompts 随 locale 变化 */
const quickAnalyses = computed(() => [
  { id: 'health', label: t('quickAnalysis.systemHealth'), prompt: t('quickAnalysis.systemHealthPrompt') },
  { id: 'disk', label: t('quickAnalysis.diskUsage'), prompt: t('quickAnalysis.diskUsagePrompt') },
  { id: 'network', label: t('quickAnalysis.network'), prompt: t('quickAnalysis.networkPrompt') },
  { id: 'process', label: t('quickAnalysis.processes'), prompt: t('quickAnalysis.processesPrompt') },
  { id: 'security', label: t('quickAnalysis.security'), prompt: t('quickAnalysis.securityPrompt') },
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
    .filter((m: { isStreaming?: boolean; error?: string; role: string; content: string }) => !m.isStreaming && !m.error)
    .map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

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
    },
    serverContext.value,
    sshStore.activeSession?.realSessionId || null,
    (cmd: string) => chatStore.appendStreamingContent(`\n\n> \`${cmd}\`\n\n`),
    agentStore.activeMode
  )
}

function handleStop() {
  if (currentStream) {
    currentStream.abort()
    currentStream = null
  }
  chatStore.finishStreaming(agentStore.activeAgentId)
}

async function handleQuickAnalysis(prompt: string) {
  if (chatStore.isGenerating) return
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return
  }

  // If connected to a real server, auto-execute diagnostic commands first
  const session = sshStore.activeSession
  if (session?.realSessionId && session.status === 'connected') {
    const groupId = quickAnalyses.value.find((q: { id: string; prompt: string }) => q.prompt === prompt)?.id
    if (groupId) {
      // Inject a placeholder message while running diagnostics
      chatStore.addUserMessage(agentStore.activeAgentId, t('ai.runningDiagnostics'))
      scrollToBottom()

      try {
        const output = await runDiagnostics(session.realSessionId, groupId)
        // Replace placeholder with actual command output + analysis prompt
        const conv = chatStore.activeConversation
        if (conv) {
          const placeholderMsg = conv.messages[conv.messages.length - 1]
          if (placeholderMsg) {
            placeholderMsg.content = formatDiagnosticOutput(
              output,
              session.serverName,
              prompt
            )
          }
        }
      } catch (e: any) {
        // On error, replace placeholder with prompt-only fallback
        const conv = chatStore.activeConversation
        if (conv) {
          const placeholderMsg = conv.messages[conv.messages.length - 1]
          if (placeholderMsg) {
            placeholderMsg.content = `[${session.serverName}] ${t('ai.diagnosticsFailed')}: ${e?.message || e}\n\n${prompt}`
          }
        }
      }

      // Now send to AI (the message already contains the formatted output)
      userScrolledUp.value = false
      scrollToBottom()
      chatStore.startStreaming(agentStore.activeAgentId)

      const chatMessages = messages.value
        .filter((m: { isStreaming?: boolean; error?: string; role: string; content: string }) => !m.isStreaming && !m.error)
        .map((m: { role: string; content: string }) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

      currentStream = await streamChat(
        agentStore.activeAgent,
        chatMessages,
        (chunk) => { chatStore.appendStreamingContent(chunk); scrollToBottom() },
        () => { chatStore.finishStreaming(agentStore.activeAgentId); currentStream = null },
        (error) => { chatStore.finishStreaming(agentStore.activeAgentId); currentStream = null; ElMessage.error(error) },
        serverContext.value,
        sshStore.activeSession?.realSessionId || null,
        (cmd: string) => chatStore.appendStreamingContent(`\n\n> \`${cmd}\`\n\n`),
        agentStore.activeMode
      )
      return
    }
  }

  // No server connected — just send the prompt as-is
  inputText.value = prompt
  handleSend()
}

onMounted(() => { register(hideMsgMenu); document.addEventListener('click', hideMsgMenu) })
onUnmounted(() => { unregister(hideMsgMenu); document.removeEventListener('click', hideMsgMenu) })

</script>

<style lang="scss" scoped>
.ai-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

// === Agent bar ===
.agent-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-sm;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
  min-height: 36px;
}

.agent-bar-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;

  .el-button {
    position: relative;
    &.active { color: $color-primary; }
  }
}

.history-count {
  position: absolute;
  top: -2px;
  right: -6px;
  font-size: 9px;
  font-weight: 700;
  color: $color-primary;
  background: rgba(91, 155, 213, 0.15);
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  border-radius: 7px;
  text-align: center;
  padding: 0 4px;
}

// === Server context ===
.server-context-bar {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px $spacing-sm;
  font-size: 10px;
  font-family: $font-family-mono;
  color: $color-text-secondary;
  background-color: rgba(76, 175, 125, 0.06);
  border-bottom: 1px solid rgba(76, 175, 125, 0.15);
  flex-shrink: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  .ctx-server-name { font-weight: 600; color: $color-text-primary; }
  .ctx-sep { color: $color-text-muted; }
  .ctx-addr { color: $color-text-secondary; }
  .ctx-badge {
    margin-left: auto;
    font-size: 9px;
    padding: 0 5px;
    border-radius: 2px;
    letter-spacing: 0.3px;
    &.connected { color: $color-success; background: rgba(76, 175, 125, 0.12); }
  }
}

// === Conversation title bar ===
.conv-title-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px $spacing-sm;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
  cursor: pointer;
  transition: background-color $transition-fast;

  &:hover { background-color: $color-bg-hover; }

  .conv-title {
    font-weight: 500;
    color: $color-text-regular;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .conv-meta {
    font-size: 10px;
    color: $color-text-placeholder;
    font-family: $font-family-mono;
    flex-shrink: 0;
  }
}

// === History panel ===
.conv-history-panel {
  flex-shrink: 0;
  max-height: 220px;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid $color-border-light;
  background-color: $color-bg-surface;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px $spacing-sm;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;

  .history-label {
    font-size: 10px;
    font-weight: 600;
    color: $color-text-placeholder;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.history-list {
  flex: 1;
  overflow-y: auto;
  padding: 2px 0;
}

.history-item {
  display: flex;
  align-items: center;
  padding: 0 $spacing-sm;
  height: 52px;
  cursor: pointer;
  transition: background-color $transition-fast;
  border-left: 2px solid transparent;

  &:hover { background-color: $color-bg-hover; }
  &.active {
    background-color: $color-bg-active;
    border-left-color: $color-primary;
  }
}

.history-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  overflow: hidden;
  min-width: 0;
}

.history-title {
  font-size: $font-size-sm;
  color: $color-text-primary;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  font-size: 10px;
  color: $color-info;
  font-family: $font-family-mono;
  margin-top: 1px;
}

.history-preview {
  font-size: 10px;
  color: $color-text-placeholder;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: $font-family-mono;
}

.history-delete {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity $transition-fast;
  color: $color-text-muted;

  &:hover { color: $color-danger; }
}

.history-item:hover .history-delete { opacity: 1; }

.history-empty {
  padding: $spacing-md;
  text-align: center;
  font-size: $font-size-xs;
  color: $color-text-placeholder;
}

// === Message list ===
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
  animation: message-enter 0.25s ease-out;

  &.user {
    .message-role { color: $color-info; }
    .message-body { background-color: $color-bg-message-user; border-top-right-radius: 2px; }
  }

  &.assistant {
    .message-role { color: $color-primary; }
    .message-body { background-color: $color-bg-message-ai; border-top-left-radius: 2px; }
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
  color: $color-info;
  font-family: $font-family-mono;
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

// === Quick analysis ===
.quick-analysis-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: $spacing-xs $spacing-sm;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
}

// === Streaming ===
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

// === Input area ===
.input-area {
  padding: $spacing-sm $spacing-md;
  border-top: 1px solid $color-border-light;
  background-color: $color-bg-toolbar;
  flex-shrink: 0;
}

.input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-xs;
  margin-top: $spacing-xs;
}

.mode-select-wrapper { flex-shrink: 0; }
.mode-select { width: 155px; }
.mode-opt { display: flex; flex-direction: column; gap: 1px; line-height: 1.2; }
.mode-opt-label { font-size: $font-size-sm; font-weight: 500; color: $color-text-primary; }
.mode-opt-desc { font-size: 10px; color: $color-text-placeholder; }

// Message entrance animation
@keyframes message-enter {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

<style lang="scss">
.ai-chat .mode-select {
  .el-input__wrapper {
    background-color: var(--color-bg-input, #1e1e32);
    border-color: var(--color-border, rgba(255,255,255,0.08));
    box-shadow: none !important;
    &:hover { border-color: var(--color-border-focus, #5b8def); }
  }
  .el-input__inner { color: var(--color-text-primary, #e8e8f0); }
}
.mode-select-popper {
  background: var(--color-bg-surface, #16162a) !important;
  border: 1px solid var(--color-border, rgba(255,255,255,0.08)) !important;
  border-radius: var(--border-radius-md, 6px);
  box-shadow: var(--shadow-lg);
  .el-select-dropdown__item {
    color: var(--color-text-primary, #e8e8f0); background: transparent; padding: 8px 12px;
    &:hover { background-color: var(--color-bg-hover); }
    &.selected { background-color: var(--color-bg-active); color: var(--color-primary); }
  }
}
</style>

