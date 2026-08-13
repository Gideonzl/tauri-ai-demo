/**
 * AI 对话状态管理
 * 多会话支持 + localStorage 持久化 + 流式输出
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useLocale } from '@/composables/useLocale'

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  agentId: string
  isStreaming?: boolean
  error?: string
}

/** 一个对话会话 */
export interface Conversation {
  id: string
  agentId: string
  title: string
  messages: ChatMessage[]
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'ai-chat-conversations'

export const useChatStore = defineStore('chat', () => {
  const { t } = useLocale()

  // 所有对话
  const conversations = ref<Conversation[]>([])
  // 当前活跃对话 ID
  const activeConversationId = ref<string>('')
  // 是否正在生成
  const isGenerating = ref(false)
  // 流式输出缓冲
  const streamingBuffer = ref('')

  // === Computed ===

  const activeConversation = computed(() =>
    conversations.value.find(c => c.id === activeConversationId.value) || null
  )

  // === ID 生成 ===

  function genId(): string {
    return `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  function genMsgId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  // === 会话管理 ===

  /** 为指定 agent 创建新会话 */
  function createConversation(agentId: string): Conversation {
    const conv: Conversation = {
      id: genId(),
      agentId,
      title: t('chat.newChat'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    conversations.value.unshift(conv)
    activeConversationId.value = conv.id
    saveToStorage()
    return conv
  }

  /** 切换到指定会话 */
  function switchConversation(id: string) {
    if (conversations.value.find(c => c.id === id)) {
      activeConversationId.value = id
    }
  }

  /** 重命名会话 */
  function renameConversation(id: string, title: string) {
    const conv = conversations.value.find(c => c.id === id)
    if (conv) {
      conv.title = title
      saveToStorage()
    }
  }

  /** 删除会话 */
  function deleteConversation(id: string) {
    conversations.value = conversations.value.filter(c => c.id !== id)
    if (activeConversationId.value === id) {
      activeConversationId.value = conversations.value[0]?.id || ''
    }
    saveToStorage()
  }

  /** 获取指定 agent 的所有会话 */
  function getConversationsByAgent(agentId: string): Conversation[] {
    return conversations.value.filter(c => c.agentId === agentId && c.messages.length > 0)
  }

  function getConversation(id: string): Conversation | null {
    return conversations.value.find(conversation => conversation.id === id) || null
  }

  /** 获取当前活跃会话的消息（与 agent 解绑 —— 一条对话持续，切 agent 不换对话） */
  function getMessages(_agentId: string): ChatMessage[] {
    return activeConversation.value?.messages || []
  }

  // === 消息操作 ===

  /** 添加用户消息到当前活跃会话（仅当没有活跃会话时才新建，切 agent 不新建） */
  function addUserMessage(agentId: string, content: string) {
    let conv = activeConversation.value
    if (!conv) {
      // 没有任何活跃会话 → 创建新会话
      conv = createConversation(agentId)
    }
    conv.messages.push({
      id: genMsgId(),
      role: 'user',
      content,
      timestamp: Date.now(),
      agentId,
    })
    // 自动用首条用户消息作为标题
    if (conv.title === t('chat.newChat') && conv.messages.length === 1) {
      conv.title = content.slice(0, 50) + (content.length > 50 ? '...' : '')
    }
    conv.updatedAt = Date.now()
    saveToStorage()
  }

  /** 开始流式输出 —— 追加到当前活跃会话 */
  function startStreaming(agentId: string) {
    isGenerating.value = true
    streamingBuffer.value = ''
    const conv = activeConversation.value
    if (conv) {
      conv.messages.push({
        id: genMsgId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId,
        isStreaming: true,
      })
    }
  }

  /** 追加流式内容 */
  function appendStreamingContent(chunk: string) {
    streamingBuffer.value += chunk
  }

  /** 结束流式输出 —— 写回当前活跃会话 */
  function finishStreaming(_agentId: string) {
    isGenerating.value = false
    const conv = activeConversation.value
    if (conv) {
      const streamingMsg = conv.messages.find(m => m.isStreaming)
      if (streamingMsg) {
        streamingMsg.content = streamingBuffer.value
        streamingMsg.isStreaming = false
      }
      conv.updatedAt = Date.now()
      saveToStorage()
    }
    streamingBuffer.value = ''
  }

  /** 清空活跃会话（创建新空会话） */
  function clearSession(agentId: string) {
    if (isGenerating.value) return // 生成中不允许清除
    createConversation(agentId)
  }

  // === 上下文注入 ===

  /** 注入远端文件/目录路径 */
  function injectFilePathToChat(agentId: string, filePath: string, fileType: 'file' | 'directory', serverInfo?: string) {
    const typeLabel = fileType === 'directory' ? t('ai.directory') : t('ai.file')
    const serverLabel = serverInfo ? ` on ${serverInfo}` : ''
    const content = `[${typeLabel}] ${filePath}${serverLabel}\n${t('ai.analyzePath', { type: typeLabel })}`
    addUserMessage(agentId, content)
  }

  /** 注入远端文件内容 */
  function injectFileContentToChat(agentId: string, filePath: string, content: string, serverInfo?: string) {
    const serverLabel = serverInfo ? ` (${serverInfo})` : ''
    const message = `${t('chat.fileContentHeader')} ${filePath}${serverLabel}\n\`\`\`\n${content}\n\`\`\`\n${t('ai.analyzeFile')}`
    addUserMessage(agentId, message)
  }

  // === 持久化 ===

  function saveToStorage() {
    try {
      // 序列化时排除正在流式输出的临时消息
      const toSave = conversations.value.map(c => ({
        ...c,
        messages: c.messages.filter(m => !m.isStreaming),
      }))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave))
    } catch (e) {
      console.error('Failed to save chat conversations:', e)
    }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        conversations.value = data || []
        // 恢复最近更新的会话为活跃会话
        if (conversations.value.length > 0) {
          const sorted = [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
          activeConversationId.value = sorted[0].id
        }
      }
    } catch (e) {
      console.error('Failed to load chat conversations:', e)
    }
  }

  /** 初始化 — 在 main.ts 中调用 */
  function init() {
    loadFromStorage()
  }

  return {
    conversations,
    activeConversationId,
    activeConversation,
    isGenerating,
    streamingBuffer,
    // Conversation CRUD
    createConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    getConversationsByAgent,
    getConversation,
    // Messages
    getMessages,
    addUserMessage,
    startStreaming,
    appendStreamingContent,
    finishStreaming,
    clearSession,
    // Context injection
    injectFilePathToChat,
    injectFileContentToChat,
    // Persistence
    init,
    saveToStorage,
  }
})
