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
import { buildAgentSystemPrompt } from './agent-prompt'
import { AgentActionStreamFilter, parseAgentResponse, type AgentAction } from './agent-response'
import {
  executeAgentAction,
  type AgentActionResult,
  type AgentCommandResult,
  type CommandAuthorization,
} from './agent-execution'
import type { AgentContextSnapshot } from './agent-context'
import { MAX_AGENT_ACTIONS, MAX_AGENT_MODEL_ROUNDS, type TroubleshootingState } from './troubleshooting-session'

export type { CommandAuthorization } from './agent-execution'

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

/** 在连接的服务器上执行命令，保留结构化状态供验证、审计和模型分析。 */
async function executeCommand(sessionId: string, command: string): Promise<AgentCommandResult> {
  const startedAt = Date.now()
  try {
    const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
    if (!isTauri) {
      return {
        stdout: '',
        stderr: `Demo 模式未连接真实服务器，无法执行：${command}`,
        exitCode: null,
        timedOut: false,
        channelError: true,
        startedAt,
        finishedAt: Date.now(),
      }
    }
    const { sshExecFull } = await import('@/api/tauri')
    const result = await sshExecFull(sessionId, command)
    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exit_code,
      timedOut: result.timed_out,
      channelError: false,
      startedAt,
      finishedAt: Date.now(),
    }
  } catch (e: any) {
    return {
      stdout: '',
      stderr: e?.message || e?.toString() || 'unknown error',
      exitCode: null,
      timedOut: false,
      channelError: true,
      startedAt,
      finishedAt: Date.now(),
    }
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
  onAuthorizeCommand?: (command: string) => Promise<CommandAuthorization>,
  onCommandCompleted?: (
    command: string,
    result: Required<AgentCommandResult>,
    authorization: CommandAuthorization,
    verification: boolean,
  ) => void,
  contextSnapshot?: AgentContextSnapshot | null,
  onStateChange?: (state: TroubleshootingState, error?: string) => void,
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

  const { locale } = useLocale()
  const effectiveMode = mode || 'agent'
  const effectiveSessionId = effectiveMode === 'qa' ? null : sessionId
  const fallbackContext: AgentContextSnapshot | null = contextSnapshot || (serverContext
    ? {
        capturedAt: Date.now(),
        host: {
          id: serverContext.host || serverContext.serverName,
          name: serverContext.serverName,
          address: serverContext.host,
          port: serverContext.port,
          username: serverContext.username,
          connectionStatus: serverContext.status,
        },
        workspace: { view: 'unknown' },
        recentOperations: [],
        activeIssue: null,
        permission: { level: 'controlled' },
      }
    : null)
  const systemContent = buildAgentSystemPrompt({
    basePrompt: agent.systemPrompt,
    locale: locale.value,
    mode: effectiveMode,
    context: fallbackContext,
    canExecute: !!effectiveSessionId && serverContext?.status === 'connected',
  })

  // ============================================================
  // Execute the full conversation (may include tool call loops)
  // ============================================================
  ;(async () => {
    try {
      await runConversationLoop(
        systemContent,
        messages,
        onChunk,
        effectiveSessionId,
        onToolStart,
        onAuthorizeCommand,
        onCommandCompleted,
        onStateChange,
        config,
        activeAbort
      )
      if (!aborted) onDone()
    } catch (e: any) {
      const msg = e?.message || String(e)
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
        onError('CORS/网络不可达 — 请在 Tauri 模式下运行')
      } else {
        onStateChange?.('blocked', msg)
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
  sessionId: string | null | undefined,
  onToolStart: ((command: string) => void) | undefined,
  onAuthorizeCommand: ((command: string) => Promise<CommandAuthorization>) | undefined,
  onCommandCompleted: ((command: string, result: Required<AgentCommandResult>, authorization: CommandAuthorization, verification: boolean) => void) | undefined,
  onStateChange: ((state: TroubleshootingState, error?: string) => void) | undefined,
  config: { apiBase: string; model: string; token: string; timeout?: number },
  abortController: AbortController
): Promise<void> {
  let actionCount = 0

  for (let round = 0; round < MAX_AGENT_MODEL_ROUNDS; round++) {
    onStateChange?.('assessing')
    const requestMessages: ChatMessage[] = [
      { role: 'system', content: systemContent },
      ...messages,
    ]

    const filter = new AgentActionStreamFilter()
    const fullContent = await streamSingleCall(
      requestMessages,
      config,
      abortController,
      (chunk) => {
        const visible = filter.push(chunk)
        if (visible) onChunk(visible)
      }
    )
    const tail = filter.finish()
    if (tail) onChunk(tail)

    if (abortController.signal.aborted) return
    const response = parseAgentResponse(fullContent)

    if (response.actions.length === 0) {
      onStateChange?.(response.status === 'blocked' ? 'blocked' : 'resolved')
      return
    }

    messages.push({
      role: 'assistant',
      content: response.displayMarkdown || '正在执行命令...',
    })

    for (const action of response.actions) {
      if (abortController.signal.aborted) return
      if (actionCount >= MAX_AGENT_ACTIONS) {
        onStateChange?.('blocked', '已达到本次任务的安全执行上限')
        messages.push({ role: 'system', content: '已达到本次任务的安全执行上限。请总结现有证据和未完成事项，不再提出命令。' })
        break
      }
      actionCount += 1
      onStateChange?.('collecting')
      onToolStart?.(action.command)
      const result = sessionId
        ? await executeAgentAction(action, {
            authorize: onAuthorizeCommand || (async () => ({
              allowed: false,
              denialMessage: '系统未配置命令权限策略，已安全阻止执行。',
            })),
            run: command => executeCommand(sessionId, command),
            onState: state => onStateChange?.(state),
            onCompleted: onCommandCompleted,
          })
        : noSessionResult(action)
      messages.push({
        role: 'user',
        content: actionResultForModel(result),
      })
    }

    onChunk('\n\n')
  }

  onStateChange?.('blocked', '已达到模型续答轮次上限')
  messages.push({
    role: 'system',
    content: '已达到模型续答轮次上限。请根据现有证据给出最终结论，不再提出命令。',
  })

  const requestMessages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...messages,
  ]

  const filter = new AgentActionStreamFilter()
  await streamSingleCall(requestMessages, config, abortController, chunk => {
    const visible = filter.push(chunk)
    if (visible) onChunk(visible)
  })
  const tail = filter.finish()
  if (tail) onChunk(tail)
}

function noSessionResult(action: AgentAction): AgentActionResult {
  return {
    action,
    status: 'denied',
    denialMessage: '当前没有可用的服务器会话。',
  }
}

function actionResultForModel(result: AgentActionResult): string {
  const primary = result.commandResult?.formatted || result.denialMessage || '[没有执行结果]'
  const verification = result.verificationResult?.formatted
  return [
    `[系统行动结果 id=${result.action.id} status=${result.status}]`,
    `命令：${result.action.command}`,
    `结果：\n${primary}`,
    verification
      ? `验证命令：${result.action.verifyCommand}\n验证结果：\n${verification}`
      : '',
    '请基于真实结果继续分析；不要重复已经成功的命令。',
  ].filter(Boolean).join('\n\n')
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
