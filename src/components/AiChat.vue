/**
 * AI对话面板 — 右侧常驻面板
 * Termius极简风格 Markdown渲染 + 代码高亮 + Stop/Abort
 */
<template>
  <div class="ai-chat" @contextmenu.prevent>
    <!-- 对话头部：身份、连接状态与低存在感操作 -->
    <div class="ai-header">
      <div class="assistant-identity">
        <span class="assistant-avatar"><el-icon :size="15"><component :is="agentIcons[agentStore.activeAgentId]" /></el-icon></span>
        <div class="assistant-copy">
          <el-select :model-value="agentStore.activeAgentId" @change="agentStore.switchAgent" size="small" class="agent-select" popper-class="agent-select-popper" :popper-append-to-body="false">
            <el-option v-for="a in agentStore.agents" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
          <span v-if="serverContext && serverContext.status === 'connected'" class="assistant-state">
            <span class="ctx-dot"></span>
            <span>{{ serverContext.serverName }}</span>
            <span class="assistant-address">{{ serverContext.username }}@{{ serverContext.host }}</span>
          </span>
          <span v-else class="assistant-state">{{ agentStore.activeAgent.description }}</span>
        </div>
      </div>
      <div class="ai-header-actions">
        <template v-if="agentStore.activeAgentId === 'ops'">
          <OpsPermissionControl :level="opsAgentStore.permissionLevel" @update:level="opsAgentStore.setPermissionLevel" />
          <el-button size="small" text :title="t('ai.remediationStart')" @click="handleStartRemediation()">
            <el-icon :size="15"><Monitor /></el-icon>
          </el-button>
          <el-button size="small" text :title="t('ai.auditTitle')" @click="showAudit = true"><el-icon :size="15"><DocumentCopy /></el-icon></el-button>
        </template>
        <el-button size="small" text :class="{ active: showHistory }" @click="showHistory = !showHistory" :title="t('ai.history')">
          <el-icon :size="15"><Clock /></el-icon>
          <span v-if="historyCount > 0" class="history-count">{{ historyCount }}</span>
        </el-button>
        <el-button size="small" text @click="handleNewChat" :title="t('ai.newChat')">
          <el-icon :size="15"><Plus /></el-icon>
        </el-button>
      </div>
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

    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef" @scroll="onScroll">
      <div v-if="messages.length === 0" class="empty-hint">
        <el-icon :size="30" class="empty-icon"><ChatDotRound /></el-icon>
        <p>{{ agentStore.activeAgent.name }}</p>
        <p class="sub">{{ agentStore.activeAgent.description }}</p>
        <p class="sub sub-hint">{{ t('ai.emptyHint') }}</p>
        <!-- 快捷分析仅在空状态显示 -->
        <div class="quick-chips" v-if="quickAnalyses.length > 0">
          <button v-for="qa in quickAnalyses" :key="qa.id" class="quick-chip" @click="handleQuickAnalysis(qa.prompt)">{{ qa.label }}</button>
        </div>
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
          <div v-if="msg.role === 'assistant' && scriptAssistResponses[msg.id]" class="script-assist-action">
            <el-button size="small" type="primary" plain @click="deliverScriptAssist(msg.id, msg.content)">
              {{ t('scripts.applyAiResult') }}
            </el-button>
          </div>
        </div>
      </div>

      <!-- 生成中指示器 -->
      <RemediationPlanCard
        v-if="agentStore.activeAgentId === 'ops' && remediationStore.currentPlan"
        :plan="remediationStore.currentPlan"
        :running="remediationStore.isRunning"
        @execute="executeRemediationPlan"
        @stop="handleStopRemediation"
      />
      <OrchestrationTaskCard
        v-if="agentStore.activeAgentId === 'ops' && orchestrationStore.currentTask?.taskType === 'remediation'"
        :task="orchestrationStore.currentTask"
        :running="orchestrationStore.isRunning"
      />
      <div v-if="chatStore.isGenerating" class="generating-bar">
        <span class="generating-dot" />
        {{ t('ai.think') }}
        <el-button size="small" type="danger" text @click="handleStop" style="margin-left:8px">{{ t('ai.stop') }}</el-button>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <div class="composer-shell">
        <el-input
          v-model="inputText"
          class="chat-composer"
          type="textarea"
          :rows="3"
          :placeholder="`${t('ai.send')} ${agentStore.activeAgent.name}...`"
          resize="none"
          @keydown.enter.exact.prevent="handleSend"
          :disabled="chatStore.isGenerating"
        />
        <div class="input-actions">
          <el-select v-model="agentStore.activeMode" size="small" class="mode-select" popper-class="mode-select-popper" :popper-append-to-body="false">
            <el-option label="智能问答" value="qa">
              <span class="mode-opt"><span class="mode-opt-label">💬 智能问答</span><span class="mode-opt-desc">仅分析与建议</span></span>
            </el-option>
            <el-option label="智能体" value="agent">
              <span class="mode-opt"><span class="mode-opt-label">⚡ 智能体</span><span class="mode-opt-desc">可执行服务器命令</span></span>
            </el-option>
          </el-select>
          <div class="ia-spacer"></div>
          <el-button
            class="composer-send"
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

    <!-- 消息右键菜单 — 复用全局 ctx-menu/ctx-item/ctx-sep 样式 -->
    <div v-if="msgMenu.visible" class="ctx-menu" :style="{ left: msgMenu.x + 'px', top: msgMenu.y + 'px' }">
      <div class="ctx-item" @click="msgMenuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
      <div class="ctx-item" @click="msgMenuAct('copyAll')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('common.copyMessage') }}</span></div>
      <div class="ctx-sep"></div>
      <div v-if="msgMenu.msg?.role === 'assistant' && extractSnapshotCommands(msgMenu.msg.content).length" class="ctx-item" @click="msgMenuAct('snapshot')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('data.saveSnapshot') }}</span></div>
      <div class="ctx-item" @click="msgMenuAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>{{ t('common.selectAll') }}</span></div>
    </div>
    <OpsAuditDrawer v-model="showAudit" :events="opsAgentStore.auditEvents" @clear="opsAgentStore.clearAudit" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useChatStore } from '@/stores/chat'
import { useWorkflowSnapshotsStore } from '@/stores/workflowSnapshots'
import { useModelStore } from '@/stores/model'
import { useSshStore } from '@/stores/ssh'
import { useOpsAgentStore } from '@/stores/opsAgent'
import { useRemediationStore } from '@/stores/remediation'
import { useOrchestrationStore } from '@/stores/orchestration'
import { useLocale } from '@/composables/useLocale'
import { streamChat } from '@/utils/ai-chat'
import type { CommandAuthorization, StreamControl, ServerContext } from '@/utils/ai-chat'
import type { Conversation } from '@/stores/chat'
import { renderMarkdown, attachCopyButtons } from '@/utils/markdown'
import { runDiagnostics, formatDiagnosticOutput, type DiagnosticCommand } from '@/utils/server-diagnostics'
import { createConservativeRemediationPlan, shouldStopAfterStep, type RemediationPlan, type RemediationStep } from '@/utils/ops-remediation'
import type { OrchestrationTask } from '@/utils/ops-orchestration'
import { getAiRunbookPrompts, type OpsRunbook } from '@/utils/ops-runbooks'
import { sshExecFull, type SshExecResult } from '@/api/tauri'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ChatDotRound, Monitor, Clock, Plus, Close, CopyDocument, DocumentCopy, Select, Edit, SetUp, DataLine } from '@element-plus/icons-vue'
import { useContextMenu } from '@/composables/useContextMenu'
import OpsPermissionControl from '@/components/OpsPermissionControl.vue'
import OpsAuditDrawer from '@/components/OpsAuditDrawer.vue'
import RemediationPlanCard from '@/components/RemediationPlanCard.vue'
import OrchestrationTaskCard from '@/components/OrchestrationTaskCard.vue'

const agentIcons: Record<string, any> = { coder: Edit, ops: SetUp, analyst: DataLine, assistant: ChatDotRound }

const agentStore = useAgentStore()
const chatStore = useChatStore()
const snapshotsStore = useWorkflowSnapshotsStore()
const modelStore = useModelStore()
const sshStore = useSshStore()
const opsAgentStore = useOpsAgentStore()
const remediationStore = useRemediationStore()
const orchestrationStore = useOrchestrationStore()
const { t } = useLocale()

const { register, unregister } = useContextMenu()
const showHistory = ref(false)
const showAudit = ref(false)

// 消息右键菜单
const msgMenu = reactive({ visible: false, x: 0, y: 0, msg: null as any })

function onMsgContextMenu(e: MouseEvent, msg: any) {
  msgMenu.msg = msg
  msgMenu.x = e.clientX
  msgMenu.y = e.clientY
  msgMenu.visible = true
}

function hideMsgMenu() { msgMenu.visible = false }

function extractSnapshotCommands(content: string): string[] {
  const commands: string[] = []
  const matches = content.matchAll(/```(?:sh|shell|bash|zsh)?\s*\n([\s\S]*?)```/gi)
  for (const match of matches) {
    const command = match[1].trim()
    if (command) commands.push(command)
  }
  return commands.slice(0, 20)
}

function saveAsSnapshot(content: string) {
  const commands = extractSnapshotCommands(content)
  const snapshot = snapshotsStore.createSnapshot({
    title: commands[0]?.split('\n')[0] || t('data.snapshots'),
    server: sshStore.activeSession ? { id: sshStore.activeSession.serverId, name: sshStore.activeSession.serverName } : undefined,
    commands: commands.map(command => ({ command, timestamp: Date.now() })),
    aiSummary: content,
  })
  if (snapshot) ElMessage.success(t('data.snapshotSaved'))
}

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
    case 'snapshot':
      saveAsSnapshot(msg.content)
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

type ScriptAssistContext = { scriptId?: string; scriptName: string; originalContent: string; mode: 'draft' | 'review' }
const scriptAssistResponses = ref<Record<string, ScriptAssistContext>>({})

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

const activeHost = computed(() => {
  const session = sshStore.activeSession
  return { id: session?.serverId || '', name: session?.serverName || serverContext.value?.serverName || '' }
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

/** All non-empty conversations, sorted by last update (decoupled from agent) */
const agentConversations = computed(() => {
  return chatStore.conversations
    .filter((c: Conversation) => c.messages.length > 0)
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

type QuickAnalysisItem = {
  id: string
  label: string
  prompt: string
  diagnosticGroupId?: string
}

function diagnosticGroupForRunbook(runbook: OpsRunbook): string {
  if (runbook.category === 'disk') return 'disk'
  if (runbook.category === 'network') return 'network'
  if (runbook.category === 'process') return 'processes'
  if (runbook.category === 'security') return 'security'
  return 'health'
}

/** 快速分析预设 — labels 和 prompts 随 locale 变化 */
const quickAnalyses = computed(() => [
  { id: 'health', label: t('quickAnalysis.systemHealth'), prompt: t('quickAnalysis.systemHealthPrompt'), diagnosticGroupId: 'health' },
  { id: 'disk', label: t('quickAnalysis.diskUsage'), prompt: t('quickAnalysis.diskUsagePrompt'), diagnosticGroupId: 'disk' },
  { id: 'network', label: t('quickAnalysis.network'), prompt: t('quickAnalysis.networkPrompt'), diagnosticGroupId: 'network' },
  { id: 'processes', label: t('quickAnalysis.processes'), prompt: t('quickAnalysis.processesPrompt'), diagnosticGroupId: 'processes' },
  { id: 'security', label: t('quickAnalysis.security'), prompt: t('quickAnalysis.securityPrompt'), diagnosticGroupId: 'security' },
  ...getAiRunbookPrompts().map(runbook => ({
    id: `runbook-${runbook.id}`,
    label: t(runbook.titleKey || ''),
    prompt: t(runbook.promptKey || ''),
    diagnosticGroupId: diagnosticGroupForRunbook(runbook),
  })),
] satisfies QuickAnalysisItem[])

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

/** Send operational evidence to the shared conversation and start analysis immediately. */
async function injectOperationsAnalysis(title: string, content: string, prompt: string, serverInfo?: string): Promise<boolean> {
  agentStore.switchAgent('ops')
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return false
  }
  if (chatStore.isGenerating) {
    ElMessage.warning(t('ai.generating'))
    return false
  }
  const target = serverInfo ? `\n服务器：${serverInfo}` : ''
  inputText.value = `【${title}】${target}\n\n\`\`\`text\n${content}\n\`\`\`\n\n${prompt}`
  userScrolledUp.value = false
  await handleSend({ bypassRemediation: true })
  return true
}

/** Send a managed script to the shared operations conversation and start generation immediately. */
async function injectScriptContext(scriptName: string, content: string, prompt: string, scriptId?: string, mode: 'draft' | 'review' = 'draft'): Promise<boolean> {
  agentStore.switchAgent('ops')
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return false
  }
  if (chatStore.isGenerating) {
    ElMessage.warning(t('ai.generating'))
    return false
  }
  inputText.value = `【脚本管理】${scriptName}\n\n\`\`\`sh\n${content || '# 待编写脚本'}\n\`\`\`\n\n${prompt}`
  userScrolledUp.value = false
  await handleSend({ bypassRemediation: true, scriptAssist: { scriptId, scriptName, originalContent: content, mode } })
  return true
}

function deliverScriptAssist(messageId: string, response: string) {
  const context = scriptAssistResponses.value[messageId]
  if (!context) return
  window.dispatchEvent(new CustomEvent('aiterminal:script-ai-response', { detail: { ...context, response } }))
  ElMessage.success(t('scripts.aiResultReady'))
}

defineExpose({ injectFilePath, injectFileContent, injectTerminalText, injectOperationsAnalysis, injectScriptContext })

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

async function handleSend(options: { bypassRemediation?: boolean; scriptAssist?: ScriptAssistContext } = {}) {
  const text = inputText.value.trim()
  if (!text) return
  if (!modelStore.defaultConfig) {
    ElMessage.warning(t('ai.pleaseConfig'))
    return
  }
  if (chatStore.isGenerating) return

  const wantsRemediation = !options.bypassRemediation
    && agentStore.activeAgentId === 'ops'
    && agentStore.activeMode === 'agent'
    && /(自愈|修复|帮我修|故障|异常|起不来|磁盘满|端口|服务)/.test(text)

  if (wantsRemediation && sshStore.activeSession?.status === 'connected') {
    inputText.value = ''
    await handleStartRemediation(text)
    return
  }

  chatStore.addUserMessage(agentStore.activeAgentId, text)
  inputText.value = ''
  userScrolledUp.value = false
  scrollToBottom()
  chatStore.startStreaming(agentStore.activeAgentId)
  const streamingMessageId = messages.value.find(message => message.isStreaming)?.id

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
      if (options.scriptAssist && streamingMessageId) {
        scriptAssistResponses.value = { ...scriptAssistResponses.value, [streamingMessageId]: options.scriptAssist }
      }
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
    agentStore.activeMode,
    handleConfirmCommand,
    handleCommandCompleted,
  )
}

function handleStop() {
  if (currentStream) {
    currentStream.abort()
    currentStream = null
  }
  chatStore.finishStreaming(agentStore.activeAgentId)
}

/** Apply the selected policy, then ask only for the confirmation level it requires. */
async function handleConfirmCommand(command: string): Promise<CommandAuthorization> {
  const decision = opsAgentStore.decide(command, activeHost.value.id)
  const auditId = opsAgentStore.recordAudit({
    hostId: activeHost.value.id,
    hostName: activeHost.value.name,
    command,
    decision,
    approved: decision.action === 'allow' ? true : null,
    status: decision.action === 'deny' ? 'denied' : 'pending',
  })

  if (decision.action === 'allow') {
    return { allowed: true, auditId, denialMessage: '' }
  }
  if (decision.action === 'deny') {
    ElMessage.warning(t('ai.commandBlocked'))
    return { allowed: false, auditId, denialMessage: decision.reason }
  }

  try {
    await ElMessageBox.confirm(
      `${decision.action === 'double_confirm' ? '⚠️ ' : ''}${t('ai.riskChange')}：${decision.reason}\n\n${t('ai.auditUnknownHost')}：${activeHost.value.name || '-'}\n\n\`${command}\`\n\n${t('common.confirm')}？`,
      decision.action === 'double_confirm' ? t('ai.confirmHighRisk') : t('ai.confirmChange'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
      }
    )
    if (decision.action === 'double_confirm') {
      await ElMessageBox.confirm(
        `${t('ai.riskHigh')}：${decision.reason}\n\n\`${command}\`\n\n${t('ai.confirmHighRiskAgain')}？`,
        t('ai.confirmHighRiskAgain'),
        {
          type: 'error',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
        }
      )
    }
    opsAgentStore.setAuditApproval(auditId, true)
    return { allowed: true, auditId, denialMessage: '' }
  } catch {
    opsAgentStore.setAuditApproval(auditId, false)
    return { allowed: false, auditId, denialMessage: t('ai.commandBlocked') }
  }
}

function handleCommandCompleted(_command: string, result: string, authorization: CommandAuthorization) {
  if (authorization.auditId) opsAgentStore.completeAudit(authorization.auditId, result)
}

function syncRemediationToOrchestration(plan: RemediationPlan) {
  const ctx = serverContext.value
  const task: OrchestrationTask = {
    id: `ops-orchestration-${plan.id}`,
    mode: 'single',
    taskType: 'remediation',
    title: plan.title,
    concurrency: 1,
    targets: [{
      hostId: plan.hostId,
      hostName: plan.hostName,
      hostAddress: ctx ? `${ctx.username}@${ctx.host}:${ctx.port}` : plan.hostName,
      sessionId: sshStore.activeSession?.realSessionId,
      status: 'pending',
    }],
    steps: plan.steps.map(step => ({
      id: step.id,
      title: step.title,
      command: step.command,
      verifyCommand: step.verifyCommand,
      risk: step.risk,
      stopOnFailure: step.stopOnFailure,
      status: step.status,
      auditId: step.auditId,
      outputSummary: step.outputSummary,
      verificationSummary: step.verificationSummary,
    })),
    status: 'queued',
    createdAt: plan.createdAt,
  }
  orchestrationStore.setTask(task)
}

function mirrorRemediationPlanStatus(status: 'running' | 'completed' | 'failed' | 'stopped') {
  orchestrationStore.setTaskStatus(status)
  if (!activeHost.value.id) return
  if (status === 'running') orchestrationStore.setTargetStatus(activeHost.value.id, 'running')
  if (status === 'completed') {
    orchestrationStore.setTargetStatus(activeHost.value.id, 'completed')
    orchestrationStore.appendTargetSummary(activeHost.value.id, t('ai.remediationCompleted'))
  }
  if (status === 'failed') orchestrationStore.setTargetStatus(activeHost.value.id, 'failed', t('ai.remediationFailed'))
  if (status === 'stopped') orchestrationStore.setTargetStatus(activeHost.value.id, 'skipped', t('ai.remediationStopped'))
}

function formatDiagnosticResult(result: SshExecResult): string {
  const parts = [result.stdout.trim(), result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ''].filter(Boolean)
  if (result.timed_out) return `${parts.join('\n') || '[无输出]'}\n[命令超时，已返回部分结果]`
  if (parts.length === 0) return `[命令执行完毕，退出码 ${result.exit_code ?? 0}，无输出]`
  return `${parts.join('\n')}${result.exit_code && result.exit_code !== 0 ? `\n[退出码 ${result.exit_code}]` : ''}`
}

async function runAuthorizedDiagnostic(item: DiagnosticCommand): Promise<string> {
  const sessionId = sshStore.activeSession?.realSessionId
  if (!sessionId) return '[策略已阻止] 当前没有可用的 SSH 会话。'
  const authorization = await handleConfirmCommand(item.command)
  if (!authorization.allowed) return `[策略已阻止] ${authorization.denialMessage}`

  let output: string
  try {
    let result = await sshExecFull(sessionId, item.command)
    output = formatDiagnosticResult(result)
    if (/^\[执行错误\]/.test(output)) {
      result = await sshExecFull(sessionId, item.command)
      output = formatDiagnosticResult(result)
    }
  } catch (error: any) {
    output = `[执行错误] ${error?.message || String(error)}`
  }
  handleCommandCompleted(item.command, output, authorization)
  return output
}

async function collectRemediationEvidence(): Promise<string> {
  const groups = ['health', 'disk', 'processes', 'network']
  const outputs: string[] = []
  for (const groupId of groups) {
    const output = await runDiagnostics(groupId, runAuthorizedDiagnostic, (label) => {
      ElMessage.info(`${t('ai.remediationCollecting')} ${label}`)
    })
    outputs.push(`--- ${groupId} ---\n${output}`)
  }
  return outputs.join('\n\n')
}

async function handleStartRemediation(issueText = inputText.value.trim()) {
  const session = sshStore.activeSession
  if (!session?.realSessionId || session.status !== 'connected') {
    ElMessage.warning(t('ai.remediationNoSession'))
    return
  }
  if (remediationStore.isRunning) return

  const prompt = issueText || messages.value[messages.value.length - 1]?.content || '请对当前服务器执行保守自愈检查'
  chatStore.addUserMessage(agentStore.activeAgentId, prompt)
  chatStore.addUserMessage(agentStore.activeAgentId, t('ai.remediationCollecting'))
  scrollToBottom()

  const diagnosticOutput = await collectRemediationEvidence()
  const plan = createConservativeRemediationPlan({
    hostId: activeHost.value.id,
    hostName: activeHost.value.name || session.serverName,
    issueText: prompt,
    diagnosticOutput,
  })

  remediationStore.setPlan(plan)
  syncRemediationToOrchestration(plan)
  ElMessage.success(t('ai.remediationCreated'))
  scrollToBottom()
}

function handleStopRemediation() {
  remediationStore.stopPlan()
  orchestrationStore.stopTask()
  ElMessage.warning(t('ai.remediationStopped'))
}

async function runRemediationCommand(step: RemediationStep, command: string, verification = false): Promise<boolean> {
  const sessionId = sshStore.activeSession?.realSessionId
  if (!sessionId) {
    remediationStore.setStepStatus(step.id, 'failed')
    remediationStore.appendStepOutput(step.id, t('ai.remediationNoSession'), verification)
    orchestrationStore.setStepStatus(step.id, 'failed')
    orchestrationStore.appendStepOutput(step.id, t('ai.remediationNoSession'), verification)
    return false
  }

  const authorization = await handleConfirmCommand(command)
  if (!authorization.allowed) {
    remediationStore.setStepStatus(step.id, 'skipped')
    remediationStore.appendStepOutput(step.id, authorization.denialMessage, verification)
    orchestrationStore.setStepStatus(step.id, 'skipped')
    orchestrationStore.appendStepOutput(step.id, authorization.denialMessage, verification)
    return false
  }
  if (authorization.auditId && !verification) remediationStore.setStepAudit(step.id, authorization.auditId)
  if (authorization.auditId && !verification) {
    const orchStep = orchestrationStore.currentTask?.steps.find(item => item.id === step.id)
    if (orchStep) orchStep.auditId = authorization.auditId
  }

  let output = ''
  try {
    let result = await sshExecFull(sessionId, command)
    output = formatDiagnosticResult(result)
    if (/^\[执行错误\]/.test(output.trim())) {
      result = await sshExecFull(sessionId, command)
      output = formatDiagnosticResult(result)
    }
  } catch (error: any) {
    output = `[执行错误] ${error?.message || String(error)}`
  }

  handleCommandCompleted(command, output, authorization)
  remediationStore.appendStepOutput(step.id, output, verification)
  orchestrationStore.appendStepOutput(step.id, output, verification)
  return !/^\[执行错误\]/.test(output.trim()) && !/\[退出码 [1-9]/.test(output)
}

async function executeRemediationPlan() {
  const plan = remediationStore.currentPlan
  if (!plan || remediationStore.isRunning) return

  remediationStore.setPlanStatus('running')
  mirrorRemediationPlanStatus('running')
  for (const step of plan.steps) {
    if (remediationStore.currentPlan?.status === 'stopped') return
    remediationStore.setStepStatus(step.id, 'waiting_approval')
    orchestrationStore.setStepStatus(step.id, 'waiting_approval')

    remediationStore.setStepStatus(step.id, 'running')
    orchestrationStore.setStepStatus(step.id, 'running')
    const executed = await runRemediationCommand(step, step.command)
    if (!executed) {
      remediationStore.setStepStatus(step.id, step.status === 'skipped' ? 'skipped' : 'failed')
      orchestrationStore.setStepStatus(step.id, step.status === 'skipped' ? 'skipped' : 'failed')
      if (shouldStopAfterStep(step)) {
        remediationStore.setPlanStatus(step.status === 'skipped' ? 'stopped' : 'failed')
        mirrorRemediationPlanStatus(step.status === 'skipped' ? 'stopped' : 'failed')
        ElMessage.error(t('ai.remediationFailed'))
        return
      }
      continue
    }

    remediationStore.setStepStatus(step.id, 'verifying')
    orchestrationStore.setStepStatus(step.id, 'verifying')
    const verified = await runRemediationCommand(step, step.verifyCommand, true)
    remediationStore.setStepStatus(step.id, verified ? 'completed' : 'failed')
    orchestrationStore.setStepStatus(step.id, verified ? 'completed' : 'failed')
    if (!verified && shouldStopAfterStep(step)) {
      remediationStore.setPlanStatus('failed')
      mirrorRemediationPlanStatus('failed')
      ElMessage.error(t('ai.remediationFailed'))
      return
    }
  }

  remediationStore.setPlanStatus('completed')
  mirrorRemediationPlanStatus('completed')
  ElMessage.success(t('ai.remediationCompleted'))
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
    const quick = quickAnalyses.value.find((q: QuickAnalysisItem) => q.prompt === prompt)
    const groupId = quick?.diagnosticGroupId || quick?.id
    if (groupId) {
      // Inject a placeholder message while running diagnostics
      chatStore.addUserMessage(agentStore.activeAgentId, t('ai.runningDiagnostics'))
      scrollToBottom()

      try {
        const output = await runDiagnostics(groupId, runAuthorizedDiagnostic)
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
        agentStore.activeMode,
        handleConfirmCommand,
        handleCommandCompleted,
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
  background: $shell-ai-bg;
  container-type: inline-size;
}

// === Compact header ===
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: $spacing-sm;
  min-height: 54px;
  padding: 8px 12px;
  border-bottom: 1px solid $color-border;
  background: transparent;
  flex-shrink: 0;
}
.assistant-identity { display: flex; align-items: center; gap: 9px; min-width: 0; flex: 1 1 0; }
.assistant-avatar {
  width: 30px; height: 30px; border-radius: $border-radius-md;
  display: inline-flex; align-items: center; justify-content: center;
  color: $color-primary; background: $color-bg-active; flex-shrink: 0;
}
.assistant-copy { display: flex; flex: 1 1 0; flex-direction: column; min-width: 0; gap: 1px; overflow: hidden; }
.agent-select { width: 100%; max-width: 138px; }
.agent-select :deep(.el-select__wrapper),
.agent-select :deep(.el-input__wrapper) {
  min-height: 20px !important;
  padding: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
}
.agent-select :deep(.el-select__selected-item),
.agent-select :deep(.el-input__inner) { color: $color-text-primary !important; font-weight: 650; }
.assistant-state { display: flex; align-items: center; gap: 4px; max-width: 170px; color: $color-text-regular; font-size: 10px; white-space: nowrap; overflow: hidden; }
.assistant-address { overflow: hidden; text-overflow: ellipsis; }
.ctx-dot { width: 6px; height: 6px; border-radius: 50%; background: $color-success; flex-shrink: 0; }
.ai-header-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;

  .el-button {
    position: relative;
    color: $color-text-regular !important;
    opacity: 1;
    &.active { color: $color-primary !important; }
    &:hover { color: $color-primary !important; }
  }
}

.history-count {
  position: absolute;
  top: -2px;
  right: -6px;
  font-size: 9px;
  font-weight: 700;
  color: $color-primary;
  background: $color-bg-active;
  min-width: 14px;
  height: 14px;
  line-height: 14px;
  border-radius: 7px;
  text-align: center;
  padding: 0 4px;
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
  padding: 18px 14px 22px;
  background: transparent;
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
  margin-bottom: 14px;
  animation: message-enter 0.25s ease-out;

  &.user {
    margin-left: auto;
    max-width: 85%;
    .message-role { display: none; }
    .message-body {
      background: $color-bg-active;
      border-color: transparent;
      border-radius: $border-radius-md;
    }
  }

  &.assistant {
    max-width: 90%;
    .message-role { color: $color-text-secondary; margin-bottom: 5px; }
    .message-body {
      background: transparent;
      border: none;
      border-left: 2px solid $color-primary;
      border-radius: 0;
      padding: 0 0 0 10px;
    }
  }
}

.message-role {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  font-size: $font-size-xs;
  font-weight: 600;
  text-transform: none;
  letter-spacing: 0;
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
  padding: 9px 11px;
  border-radius: $border-radius-md;
  border: 1px solid $color-border;
  box-shadow: none;
  font-size: $font-size-sm;
  line-height: 1.62;
  color: $color-text-primary;
}
.script-assist-action { display: flex; margin-top: 10px; }

.message-error {
  margin-top: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  font-size: $font-size-xs;
  color: $color-danger;
  background: rgba(224, 85, 85, 0.1);
  border-radius: 2px;
}

// === Quick analysis ===
// === Quick analysis chips (empty state only) ===
.quick-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin-top: $spacing-md;
  padding: 0 $spacing-md;
}
.quick-chip {
  padding: 4px 12px;
  border: 1px solid $color-border;
  border-radius: 14px;
  background: $color-bg-input;
  cursor: pointer;
  font-family: inherit;
  font-size: $font-size-xs;
  color: $color-text-secondary;
  transition: all $transition-fast;
  &:hover { border-color: $color-primary; color: $color-primary; background: $color-bg-active; }
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
  padding: 10px 12px 12px;
  border-top: 1px solid $color-border;
  background: transparent;
  box-shadow: none;
  flex-shrink: 0;
}

@container (max-width: 460px) {
  .ai-header { gap: 4px; padding: 8px; }
  .ai-header-actions { gap: 0; }
  .ai-header-actions :deep(.el-button--small) { padding: 0 7px !important; }
  .ai-header-actions :deep(.ops-permission-control .permission-label) { display: none; }
}

@container (max-width: 300px) {
  .assistant-avatar { width: 28px; height: 28px; }
  .agent-select { max-width: 94px; }
  .assistant-state { max-width: 110px; }
}

.composer-shell {
  border: 1px solid $color-border;
  border-radius: 8px;
  background: $surface-contrast;
  padding: 5px;
  transition: border-color $transition-fast, background-color $transition-fast;
  &:focus-within { border-color: $color-border-focus; }
}
.chat-composer :deep(.el-textarea__inner) {
  min-height: 64px !important;
  padding: 7px 8px !important;
  background: transparent !important;
  box-shadow: none !important;
  resize: none !important;
  line-height: 1.6;
}

.input-actions {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  min-height: 28px;
  padding: 2px 2px 0;
}

.ia-spacer { flex: 1; }
.mode-select { width: 124px; flex-shrink: 0; }
.composer-send { min-width: 52px; }
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

