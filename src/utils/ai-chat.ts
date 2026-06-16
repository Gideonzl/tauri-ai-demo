/**
 * AI 流式对话封装
 * Tauri 环境下自动使用 @tauri-apps/plugin-http 的 fetch（绕过 CORS）
 * 非 Tauri 环境使用浏览器原生 fetch
 * 返回 StreamControl 对象支持外部中止生成
 */
import { useModelStore } from '@/stores/model'
import { useLocale } from '@/composables/useLocale'
import type { Agent } from '@/stores/agent'

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** 中止控制器，暴露给外部调用 .abort() */
export interface StreamControl {
  abort: () => void
}

/** 动态获取合适的 fetch 函数（Tauri → plugin-http，浏览器 → 原生） */
async function resolveFetch(): Promise<typeof globalThis.fetch> {
  try {
    if ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__) {
      const mod = await import('@tauri-apps/plugin-http')
      return mod.fetch as typeof globalThis.fetch
    }
  } catch { /* 退回浏览器 fetch */ }
  return globalThis.fetch
}

export interface ServerContext {
  serverName: string
  host: string
  port: number
  username: string
  status: string
}

export async function streamChat(
  agent: Agent,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  serverContext?: ServerContext | null
): Promise<StreamControl> {
  const modelStore = useModelStore()
  const config = modelStore.defaultConfig

  if (!config || !config.token) {
    onError('Please configure AI model in AI Model Config page')
    return { abort: () => {} }
  }

  const $fetch = await resolveFetch()

  // Build system prompt with language instruction + server context
  const { locale } = useLocale()
  let systemContent = agent.systemPrompt

  // Language instruction — prepend to ensure AI responds in the user's language
  if (locale.value === 'zh-CN') {
    systemContent = `IMPORTANT: You MUST respond in Chinese (Simplified Chinese / 简体中文). All your replies, explanations, code comments, and diagnostic notes must be written in Chinese. The user's preferred language is Chinese.\n\n` + systemContent
  }

  if (serverContext && serverContext.status === 'connected') {
    systemContent += `\n\n=== CURRENT SERVER CONTEXT ===\nYou are currently assisting with a server the user is connected to. Use this context for all server-related questions:\n- Server Name: ${serverContext.serverName}\n- Host: ${serverContext.host}:${serverContext.port}\n- User: ${serverContext.username}\n\nWhen the user asks about "the server", "current server", "this server", CPU, memory, disk, processes, logs, or any system operations — they are referring to THIS server. Always include the specific host (${serverContext.host}) in your diagnostic commands. Do NOT ask the user to specify which server unless they have multiple contexts.`
  }

  const requestMessages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...messages,
  ]

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), config.timeout || 60000)
  let aborted = false

  const streamControl: StreamControl = {
    abort: () => {
      aborted = true
      controller.abort()
    }
  }

  // 异步执行流式请求（不阻塞返回 StreamControl）
  ;(async () => {
    try {
      const response = await $fetch(`${config.apiBase}/chat/completions`, {
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
        onError(`API error: ${response.status} ${errText.slice(0, 200)}`)
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        onError('Cannot read response stream')
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''

      while (!aborted) {
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
            } catch { /* skip malformed JSON */ }
          }
        }
      }

      if (!aborted) onDone()
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (aborted) {
        onDone() // 用户主动中止，视为正常结束
      } else if (e instanceof DOMException && e.name === 'AbortError') {
        onError('Request timeout')
      } else {
        const msg = e?.message || String(e)
        if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
          onError('CORS/network unreachable — try running in Tauri mode')
        } else {
          onError(msg)
        }
      }
    }
  })()

  return streamControl
}
