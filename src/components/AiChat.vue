/**
 * AI对话面板 — 右侧常驻面板
 * Termius极简风格：无emoji、冷灰调、紧凑排版
 * 智能体切换在面板顶部，无Token配置入口
 */
<template>
  <div class="ai-chat">
    <!-- 智能体切换栏 -->
    <div class="agent-bar">
      <AgentSwitch />
    </div>

    <!-- 消息列表 -->
    <div class="message-list" ref="messageListRef">
      <div v-if="messages.length === 0" class="empty-hint">
        <el-icon :size="32" class="empty-icon"><ChatDotRound /></el-icon>
        <p>{{ agentStore.activeAgent.name }}</p>
        <p class="sub">{{ agentStore.activeAgent.description }}</p>
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="message-item"
        :class="msg.role"
      >
        <div class="message-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
        <div class="message-body">
          <div class="message-content" v-html="renderContent(msg.content)"></div>
          <div v-if="msg.isStreaming" class="streaming-cursor">_</div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <el-input
        v-model="inputText"
        type="textarea"
        :rows="2"
        :placeholder="`Message ${agentStore.activeAgent.name}...`"
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
          Clear
        </el-button>
        <el-button
          type="primary"
          size="small"
          :disabled="!inputText.trim() || chatStore.isGenerating"
          @click="handleSend"
        >
          {{ chatStore.isGenerating ? 'Generating...' : 'Send' }}
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
import { streamChat } from '@/utils/ai-chat'
import { ElMessage } from 'element-plus'
import { ChatDotRound } from '@element-plus/icons-vue'
import AgentSwitch from '@/components/AgentSwitch.vue'

const agentStore = useAgentStore()
const chatStore = useChatStore()
const modelStore = useModelStore()

const inputText = ref('')
const messageListRef = ref<HTMLElement>()

/**
 * 注入远端文件路径到AI对话
 * 供SFTP文件树调用：选中文件/目录后快捷送入AI
 */
function injectFilePath(filePath: string, fileType: 'file' | 'directory', serverInfo?: string) {
  chatStore.injectFilePathToChat(agentStore.activeAgentId, filePath, fileType, serverInfo)
  scrollToBottom()
}

/**
 * 注入远端文件内容到AI对话
 * 供SFTP文件树调用：选中文件后把内容送入AI分析
 */
function injectFileContent(filePath: string, content: string, serverInfo?: string) {
  chatStore.injectFileContentToChat(agentStore.activeAgentId, filePath, content, serverInfo)
  scrollToBottom()
}

// 暴露给父组件（MainLayout）使用
defineExpose({
  injectFilePath,
  injectFileContent,
})

const messages = computed(() => chatStore.getMessages(agentStore.activeAgentId))

function renderContent(content: string): string {
  return content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}

function scrollToBottom() {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight
    }
  })
}

watch(messages, () => scrollToBottom(), { deep: true })

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return

  if (!modelStore.defaultConfig) {
    ElMessage.warning('Please configure AI model first')
    return
  }

  chatStore.addUserMessage(agentStore.activeAgentId, text)
  inputText.value = ''
  scrollToBottom()

  chatStore.startStreaming(agentStore.activeAgentId)

  const chatMessages = messages.value
    .filter(m => !m.isStreaming)
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  await streamChat(
    agentStore.activeAgent,
    chatMessages,
    (chunk) => {
      chatStore.appendStreamingContent(chunk)
      scrollToBottom()
    },
    () => {
      chatStore.finishStreaming(agentStore.activeAgentId)
    },
    (error) => {
      chatStore.finishStreaming(agentStore.activeAgentId)
      ElMessage.error(error)
    }
  )
}

function handleClear() {
  chatStore.clearSession(agentStore.activeAgentId)
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
  p { font-size: $font-size-sm; }
  .sub { font-size: $font-size-xs; color: $color-text-placeholder; }
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
  font-size: $font-size-xs;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  margin-bottom: 2px;
}

.message-body {
  padding: $spacing-sm $spacing-md;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
  line-height: 1.55;
  color: $color-text-primary;

  :deep(code) {
    background-color: rgba(255, 255, 255, 0.06);
    padding: 1px 4px;
    border-radius: 2px;
    font-family: $font-family-mono;
    font-size: $font-size-xs;
    color: $color-primary-light;
  }
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
