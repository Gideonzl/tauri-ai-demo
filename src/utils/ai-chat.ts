/**
 * AI 流式对话封装 — 支持 Function Calling（工具调用）
 *
 * 当 AI 需要在服务器上执行命令时，输出：
 *   <execute_command>
 *   ls -la /root
 *   </execute_command>
 *
 * 前端自动：
 *   1. 检测到工具调用 → 摘取命令 → 通过 sshExec 在服务器上执行
 *   2. 将命令输出注入对话 → 再次调用 AI 分析结果 → 流式输出最终回复
 */
import { useModelStore } from '@/stores/model'
import { useLocale } from '@/composables/useLocale'
import type { Agent, AgentMode } from '@/stores/agent'

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

// ============================================================
// Tool calling helpers
// ============================================================

interface ToolCall {
  name: string
  command: string
}

/** 从 AI 回复中提取 <execute_command>...</execute_command> 块 */
function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = []
  const regex = /<execute_command>\s*([\s\S]*?)\s*<\/execute_command>/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    calls.push({ name: 'ssh_exec', command: match[1].trim() })
  }
  return calls
}

/** 移除工具调用标签，返回纯净的显示文本 */
function stripToolCalls(content: string): string {
  return content.replace(/<execute_command>[\s\S]*?<\/execute_command>/g, '').trim()
}

/** 在连接的服务器上执行命令 */
async function executeCommand(sessionId: string, command: string): Promise<string> {
  try {
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
    if (!isTauri) {
      return `[Demo mode — server not available]\nCommand: ${command}\n(Connect to a real server via Tauri to execute commands)`
    }
    const { sshExec } = await import('@/api/tauri')
    const output = await sshExec(sessionId, command)
    return output.trim() || '(command executed successfully, no output)'
  } catch (e: any) {
    return `Error executing command: ${e?.message || e?.toString() || 'unknown error'}`
  }
}

// ============================================================
// Core streaming function
// ============================================================

/**
 * 执行 AI 对话 + 工具调用的完整循环
 *
 * @param agent         当前智能体配置
 * @param messages      对话历史（不含 system prompt）
 * @param onChunk       流式内容回调
 * @param onDone        完成回调
 * @param onError       错误回调
 * @param serverContext 当前连接的服务器信息
 * @param sessionId     活动的 SSH session ID（用于执行远程命令）
 * @param onToolStart   工具调用开始回调（通知 UI 显示加载状态）
 */
export async function streamChat(
  agent: Agent,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  serverContext?: ServerContext | null,
  sessionId?: string | null,
  onToolStart?: (command: string) => void,
  mode?: AgentMode
): Promise<StreamControl> {
  const modelStore = useModelStore()
  const config = modelStore.defaultConfig

  if (!config || !config.token) {
    onError('Please configure AI model in AI Model Config page')
    return { abort: () => {} }
  }

  let aborted = false
  const activeAbort = new AbortController()

  const streamControl: StreamControl = {
    abort: () => {
      aborted = true
      activeAbort.abort()
    }
  }

  // ============================================================
  // Build system prompt
  // ============================================================
  const { locale } = useLocale()
  let systemContent = agent.systemPrompt

  // Language instruction
  if (locale.value === 'zh-CN') {
    systemContent = `IMPORTANT: You MUST respond in Chinese (Simplified Chinese / 简体中文). All your replies, explanations, code comments, and diagnostic notes must be written in Chinese. The user's preferred language is Chinese.\n\n` + systemContent
  }

  // Server context
  if (serverContext && serverContext.status === 'connected') {
    systemContent += `\n\n=== 当前服务器连接信息 ===\n你正在协助用户管理一台已连接的服务器：\n- 服务器名称：${serverContext.serverName}\n- 地址：${serverContext.host}:${serverContext.port}\n- 用户：${serverContext.username}\n\n当用户提到"服务器"、"当前服务器"、"这台服务器"、CPU、内存、磁盘、进程、日志或任何系统操作时，他们指的就是这台服务器。`
  }

  // Determine effective sessionId based on mode
  // In 'qa' mode, NEVER allow command execution — force sessionId to null
  const effectiveSessionId = (mode === 'qa') ? null : sessionId

  // Tool calling instructions — only injected in 'agent' mode
  if (effectiveSessionId && serverContext && serverContext.status === 'connected') {
    systemContent += `\n\n=== 远程命令执行能力 ===\n你**可以直接在这台服务器上执行命令**。不需要让用户手动操作。当用户要求查看文件、检查状态、运行诊断或执行任何服务器操作时，请**直接执行**，不要只给出命令建议。

**如何执行命令：** 在你希望执行命令的地方，使用以下格式：
<execute_command>
ls -la /root
</execute_command>

系统会自动在服务器上执行该命令，并将输出结果返回给你。你会看到命令输出，然后可以继续分析并向用户解释。

**重要规则：**
- 每个命令单独放在一个 <execute_command> 块中
- 可以同时输出多个命令块
- 先给出简要说明（如"我来查看一下..."），再执行命令
- 收到命令输出后，用自然语言解释结果
- **永远不要**只给命令让用户自己去执行 — 你直接执行
- 对于危险操作（rm -rf、drop database、iptables -F 等），先警告用户并确认`
  } else if (serverContext && serverContext.status === 'connected' && mode === 'qa') {
    // Q&A mode with server connected — explicitly tell AI to NOT execute commands
    systemContent += `

=== 工作模式：智能问答（仅提供建议） ===
你当前处于**智能问答模式**，**不能**直接在服务器上执行命令。你的职责是：
- 分析用户的问题和需求
- 提供专业的建议、方案和命令示例
- 解释相关概念和最佳实践
- 帮助用户理解服务器运维知识

**重要：不要使用 <execute_command> 标签。** 如果你认为某些命令有用，请用 markdown 代码块展示给用户，让用户自己决定是否执行。`
  }

  // ============================================================
  // Execute the full conversation (may include tool call loops)
  // ============================================================
  ;(async () => {
    try {
      await runConversationLoop(
        systemContent,
        messages,
        onChunk,
        onError,
        effectiveSessionId,
        onToolStart,
        config,
        activeAbort
      )
      if (!aborted) onDone()
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        onError('CORS/网络不可达 — 请在 Tauri 模式下运行')
      } else {
        onError(msg)
      }
    }
  })()

  return streamControl
}

// ============================================================
// Conversation loop — handles multi-turn tool execution
// ============================================================

async function runConversationLoop(
  systemContent: string,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onError: (error: string) => void,
  sessionId: string | null | undefined,
  onToolStart: ((command: string) => void) | undefined,
  config: { apiBase: string; model: string; token: string; timeout?: number },
  abortController: AbortController
): Promise<void> {
  const MAX_TOOL_ROUNDS = 5

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const requestMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...messages,
    ]

    // Collect full response
    let fullContent = ''
    const toolCallFound = await streamSingleCall(
      requestMessages,
      config,
      abortController,
      (chunk) => {
        fullContent += chunk
        onChunk(chunk)
      }
    )

    if (abortController.signal.aborted) return

    // Check for tool calls
    const toolCalls = parseToolCalls(fullContent)

    if (toolCalls.length === 0) {
      // No tools — this is the final answer
      return
    }

    // Tool calls found — strip them from displayed content
    // But we already streamed the raw content to the user...
    // For now: the user sees the AI's "thinking" text including tool blocks.
    // Clear the partial output and let the tool execution + final response
    // produce the actual result.

    // Add the AI's response (without tool blocks) as assistant message
    const cleanContent = stripToolCalls(fullContent)
    if (cleanContent) {
      messages.push({ role: 'assistant', content: cleanContent })
    } else {
      // AI only output a tool call with no surrounding text
      messages.push({ role: 'assistant', content: '正在执行命令...' })
    }

    // Execute each tool call
    for (const tc of toolCalls) {
      if (abortController.signal.aborted) return

      onToolStart?.(tc.command)

      if (!sessionId) {
        messages.push({
          role: 'user',
          content: `[无法执行] 未连接到服务器。命令：${tc.command}`,
        })
        continue
      }

      const result = await executeCommand(sessionId, tc.command)

      messages.push({
        role: 'user',
        content: `命令: ${tc.command}\n\n输出:\n${result}`,
      })
    }

    // Continue the loop — AI will process tool results and respond
    // Clear previous onChunk output by sending a separator
    onChunk('\n\n')
  }

  // Max rounds reached — ask AI to finalize
  messages.push({
    role: 'system',
    content: '请根据以上所有命令执行结果，给出最终的分析和建议。',
  })

  const requestMessages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...messages,
  ]

  await streamSingleCall(requestMessages, config, abortController, onChunk)
}

// ============================================================
// Single API call — stream response, return full content
// ============================================================

async function streamSingleCall(
  messages: ChatMessage[],
  config: { apiBase: string; model: string; token: string; timeout?: number },
  abortController: AbortController,
  onChunk: (chunk: string) => void
): Promise<string> {
  const $fetch = await resolveFetch()

  const response = await $fetch(`${config.apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
    }),
    signal: abortController.signal,
  })

  if (!response.ok) {
    const errText = await response.text().catch(() => '')
    throw new Error(`API error: ${response.status} ${errText.slice(0, 200)}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('Cannot read response stream')

  const decoder = new TextDecoder()
  let buffer = ''
  let fullContent = ''

  while (!abortController.signal.aborted) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6).trim()
        if (data === '[DONE]') return fullContent
        try {
          const parsed = JSON.parse(data)
          const content = parsed.choices?.[0]?.delta?.content
          if (content) {
            fullContent += content
            onChunk(content)
          }
        } catch { /* skip malformed JSON */ }
      }
    }
  }

  return fullContent
}
