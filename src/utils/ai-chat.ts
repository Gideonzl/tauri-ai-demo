/**
 * AI流式对话封装
 * 从modelStore读取当前默认AI配置发起请求
 * 支持Tauri Event SSE + 前端fetch双模式
 */
import { useModelStore } from '@/stores/model'
import type { Agent } from '@/stores/agent'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 前端直接fetch SSE流式对话
 * 从modelStore.defaultConfig读取API地址和Token
 */
export async function streamChat(
  agent: Agent,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void
): Promise<void> {
  const modelStore = useModelStore()
  const config = modelStore.defaultConfig

  if (!config || !config.token) {
    onError('Please configure AI model in AI Model Config page')
    return
  }

  const requestMessages: ChatMessage[] = [
    { role: 'system', content: agent.systemPrompt },
    ...messages,
  ]

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), config.timeout || 30000)

    const response = await fetch(`${config.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: requestMessages,
        stream: true,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      onError(`API error: ${response.status} ${errText.slice(0, 100)}`)
      return
    }

    const reader = response.body?.getReader()
    if (!reader) {
      onError('Cannot read response stream')
      return
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6).trim()
          if (data === '[DONE]') {
            onDone()
            return
          }
          try {
            const parsed = JSON.parse(data)
            const content = parsed.choices?.[0]?.delta?.content
            if (content) onChunk(content)
          } catch { /* skip */ }
        }
      }
    }

    onDone()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      onError('Request timeout')
    } else {
      onError(`Request error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}
