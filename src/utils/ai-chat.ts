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

/** 判断命令是否为高危操作，用于确认弹窗的警告样式。 */
export function isDangerousCommand(command: string): boolean {
  const c = command.toLowerCase()
  const patterns: RegExp[] = [
    /\brm\s+-[a-z]*(r|f)/,                 // rm -rf / -r / -f
    /\bmkfs\.?\w*/,                         // mkfs / mkfs.ext4 ...
    /\bdd\b[^|]*\bof=/,                     // dd of=...
    /\bfdisk\b|\bparted\b|\bwipefs\b|\bsgdisk\b/,
    /:\s*\(\)\s*\{\s*:\s*\|/,               // fork bomb :(){ :|:& };:
    /\bshutdown\b|\breboot\b|\bhalt\b|\bpoweroff\b|\binit\s+0\b/,
    /\biptables\s+-f\b|\bnft\s+flush\b|\bufw\s+reset\b/,
    /\bdrop\s+(database|table)\b|\btruncate\s+table\b/,
    /\bchmod\s+-r\s+0?777\b/,
    /\b(userdel|groupdel|deluser)\b/,
    /\bkill(all)?\s+-9\b|\bpkill\s+-9\b/,
    />\s*\/dev\/(sd[a-z]|nvme\d|mapper)/,   // writing to raw disks
    /\bmv\s+[^|&]*\s+\/(dev|etc|bin|sbin|boot|sys|proc|lib)\b/,
    /\b(systemctl|service)\s+(stop|disable|mask)\b/,
    /\bgit\s+(reset\s+--hard|clean\s+-[a-z]*f|push\b[^|]*--force)/,
  ]
  return patterns.some((re) => re.test(c))
}

/** 把结构化执行结果格式化成给模型看的清晰反馈 —
 *  关键：空输出必须明确标注"成功、退出码 0"，绝不能让模型误判成连接断开 */
function formatExecResult(r: { stdout: string; stderr: string; exit_code: number | null; timed_out: boolean }): string {
  const out = (r.stdout || '').trim()
  const err = (r.stderr || '').trim()
  const parts: string[] = []
  if (out) parts.push(out)
  if (err) parts.push(`[stderr]\n${err}`)
  let body = parts.join('\n')

  if (r.timed_out) {
    body += (body ? '\n' : '') + '[提示] 命令在超时时间内未结束（可能是持续运行的命令，如 tail -f / top），以上为已获取的部分输出。请改用带明确结束的命令（如加 head、-bn1、--no-pager）。'
    return body
  }
  if (!out && !err) {
    // 成功但无输出：明确告知，避免被当成失败/断线
    return `[命令执行完毕，退出码 ${r.exit_code ?? 0}，无输出]`
  }
  if (r.exit_code != null && r.exit_code !== 0) {
    body += `\n[退出码 ${r.exit_code} — 命令本身返回错误，请阅读上面的信息判断原因]`
  }
  return body
}

/** 在连接的服务器上执行命令，返回结构化后的文本反馈 */
async function executeCommand(sessionId: string, command: string): Promise<string> {
  try {
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
    if (!isTauri) {
      return `[Demo 模式 — 未连接真实服务器，无法执行]\n命令：${command}`
    }
    const { sshExecFull } = await import('@/api/tauri')
    const result = await sshExecFull(sessionId, command)
    return formatExecResult(result)
  } catch (e: any) {
    // 走到这里才是真正的通道/连接级错误
    return `[执行错误] ${e?.message || e?.toString() || 'unknown error'}`
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
  mode?: AgentMode,
  onConfirmCommand?: (command: string) => Promise<boolean>
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
- 先给出简要说明（如"我来查看一下..."），然后等待系统弹窗确认
- 用户允许后由系统自动执行；用户拒绝后改用安全的替代方案或说明原因
- 收到命令输出后，用自然语言解释结果
- **永远不要**只给命令让用户自己执行 — 系统会在确认后自动执行
- 对于危险操作（rm -rf、drop database、iptables -F 等），先警告用户并确认

**如何理解执行结果（关键，务必遵守）：**
- 结果为"[命令执行完毕，退出码 0，无输出]"表示命令**成功但本身没有输出**（如 grep 无匹配、目录为空、服务无日志），这是**正常现象**，请据此继续分析或执行下一步。**绝不能**因此说"无输出/连接断了"。
- 结果带"[退出码 N]"（N≠0）或 stderr，说明**命令本身报错**（权限不足、路径不存在、参数错误等），请阅读错误信息、修正命令后**自己重试**，或向用户解释原因并给出替代方案。
- 结果为"[执行错误] ..."才可能是连接/通道问题。**系统底层已内置自动重连**，前端也会自动重试一次；如果仍收到该错误，请改用更轻量、更有界的诊断命令或说明当前错误。**绝不要**因此让用户手动执行，也**绝不要**声称"无法主动重连 / 环境受限 / 连接又断了"——你完全具备重连和重试能力。
- **禁止**输出"请把命令复制到你的终端执行后把结果贴给我""建议你手动运行以下命令"之类的话。你就是执行者，请直接执行。
- **在任何情况下都不要**要求用户"手动执行命令并把结果贴给你" —— 你具备执行能力，遇到空输出或报错请自行重试、换命令或换思路，而不是把任务退回给用户。`
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
        onConfirmCommand,
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
  onConfirmCommand: ((command: string) => Promise<boolean>) | undefined,
  config: { apiBase: string; model: string; token: string; timeout?: number },
  abortController: AbortController
): Promise<void> {
  const MAX_TOOL_ROUNDS = 20

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

      if (!sessionId) {
        messages.push({
          role: 'user',
          content: `[无法执行] 未连接到服务器。命令：${tc.command}`,
        })
        continue
      }

      // Ask once for permission, then execute the command automatically.
      // This keeps the user in control without sending command execution back
      // to a terminal they must operate manually.
      if (onConfirmCommand) {
        const approved = await onConfirmCommand(tc.command)
        if (abortController.signal.aborted) return
        if (!approved) {
          messages.push({
            role: 'user',
            content: `命令: ${tc.command}\n\n输出:\n[用户拒绝执行该命令。请勿重复尝试同一命令，改用更安全的只读方式，或直接向用户说明并等待指示。]`,
          })
          continue
        }
      }

      onToolStart?.(tc.command)

      let result = await executeCommand(sessionId, tc.command)
      // A "[执行错误]" is the only channel/connection-level failure. The Rust
      // layer already self-reconnects, so a single retry almost always succeeds.
      // Never surface this to the user as "please run it yourself".
      if (/^\[执行错误\]/.test(result.trim())) {
        result = await executeCommand(sessionId, tc.command)
      }

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
