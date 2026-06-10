/**
 * AI对话状态管理
 * 管理对话消息、流式输出、上下文隔离
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

/** 对话消息 */
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: number
  agentId: string
  isStreaming?: boolean
}

/** 对话会话（按智能体隔离） */
export interface ChatSession {
  agentId: string
  messages: ChatMessage[]
}

export const useChatStore = defineStore('chat', () => {
  // 各智能体的对话会话（上下文隔离）
  const sessions = ref<Map<string, ChatSession>>(new Map())
  // 当前是否正在生成回复
  const isGenerating = ref(false)
  // 流式输出缓冲
  const streamingBuffer = ref('')

  // 获取当前智能体的消息列表
  function getMessages(agentId: string): ChatMessage[] {
    const session = sessions.value.get(agentId)
    return session ? session.messages : []
  }

  // 添加用户消息
  function addUserMessage(agentId: string, content: string) {
    let session = sessions.value.get(agentId)
    if (!session) {
      session = { agentId, messages: [] }
      sessions.value.set(agentId, session)
    }
    session.messages.push({
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'user',
      content,
      timestamp: Date.now(),
      agentId,
    })
  }

  // 添加AI回复消息
  function addAssistantMessage(agentId: string, content: string) {
    const session = sessions.value.get(agentId)
    if (session) {
      session.messages.push({
        id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: 'assistant',
        content,
        timestamp: Date.now(),
        agentId,
      })
    }
  }

  // 开始流式输出
  function startStreaming(agentId: string) {
    isGenerating.value = true
    streamingBuffer.value = ''
    // 添加一条空的assistant消息作为流式容器
    const session = sessions.value.get(agentId)
    if (session) {
      session.messages.push({
        id: `msg-streaming-${Date.now()}`,
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
        agentId,
        isStreaming: true,
      })
    }
  }

  // 追加流式内容
  function appendStreamingContent(chunk: string) {
    streamingBuffer.value += chunk
  }

  // 结束流式输出
  function finishStreaming(agentId: string) {
    isGenerating.value = false
    const session = sessions.value.get(agentId)
    if (session) {
      const streamingMsg = session.messages.find(m => m.isStreaming)
      if (streamingMsg) {
        streamingMsg.content = streamingBuffer.value
        streamingMsg.isStreaming = false
      }
    }
    streamingBuffer.value = ''
  }

  // 清空当前智能体的对话
  function clearSession(agentId: string) {
    sessions.value.delete(agentId)
  }

  /**
   * 注入远端文件/目录路径到AI对话
   * SSH连接增强：选中远端文件后，可快捷把路径内容送入AI
   * 让AI解析文件信息、生成操作指令
   */
  function injectFilePathToChat(agentId: string, filePath: string, fileType: 'file' | 'directory', serverInfo?: string) {
    const typeLabel = fileType === 'directory' ? 'Directory' : 'File'
    const serverLabel = serverInfo ? ` on ${serverInfo}` : ''
    const content = `[${typeLabel}] ${filePath}${serverLabel}\nPlease analyze this ${fileType === 'directory' ? 'directory' : 'file'} path and provide relevant information or suggestions.`
    addUserMessage(agentId, content)
  }

  /**
   * 注入远端文件内容到AI对话
   * 当用户想用AI分析某个文件的具体内容时
   */
  function injectFileContentToChat(agentId: string, filePath: string, content: string, serverInfo?: string) {
    const serverLabel = serverInfo ? ` (${serverInfo})` : ''
    const message = `[File Content] ${filePath}${serverLabel}\n\`\`\`\n${content}\n\`\`\`\nPlease analyze this file content.`
    addUserMessage(agentId, message)
  }

  return {
    sessions,
    isGenerating,
    streamingBuffer,
    getMessages,
    addUserMessage,
    addAssistantMessage,
    startStreaming,
    appendStreamingContent,
    finishStreaming,
    clearSession,
    injectFilePathToChat,
    injectFileContentToChat,
  }
})
