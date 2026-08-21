import type { AgentAction } from './agent-response.ts'
import type { TroubleshootingState } from './troubleshooting-session.ts'

export interface CommandAuthorization {
  allowed: boolean
  auditId?: string
  denialMessage: string
}

export interface AgentCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  channelError: boolean
  startedAt?: number
  finishedAt?: number
  formatted?: string
}

export interface AgentActionResult {
  action: AgentAction
  status: 'denied' | 'failed' | 'completed' | 'verified' | 'verification_failed'
  commandResult?: Required<AgentCommandResult>
  verificationResult?: Required<AgentCommandResult>
  denialMessage?: string
}

export interface AgentExecutionDependencies {
  authorize(command: string): Promise<CommandAuthorization>
  run(command: string): Promise<AgentCommandResult>
  onState?(state: TroubleshootingState): void
  onCompleted?(
    command: string,
    result: Required<AgentCommandResult>,
    authorization: CommandAuthorization,
    verification: boolean,
  ): void
}

function formatBody(result: AgentCommandResult): string {
  const stdout = (result.stdout || '').trim()
  const stderr = (result.stderr || '').trim()
  const parts: string[] = []
  if (stdout) parts.push(stdout)
  if (stderr) parts.push(`[stderr]\n${stderr}`)
  let body = parts.join('\n')

  if (result.channelError) {
    return `[执行错误] ${body || 'SSH 命令通道不可用'}`
  }
  if (result.timedOut) {
    return `${body ? `${body}\n` : ''}[命令超时，已保留部分输出。请改用带行数、时间范围或 --no-pager 的有界命令。]`
  }
  if (!stdout && !stderr) {
    return `[命令执行完毕，退出码 ${result.exitCode ?? 0}，无输出]`
  }
  if (result.exitCode !== null && result.exitCode !== 0) {
    body += `\n[退出码 ${result.exitCode} — 命令本身返回错误]`
  }
  return body
}

export function formatAgentCommandResult(
  result: AgentCommandResult,
  fallbackStartedAt: number = Date.now(),
  fallbackFinishedAt: number = Date.now(),
): Required<AgentCommandResult> {
  const startedAt = result.startedAt ?? fallbackStartedAt
  const finishedAt = Math.max(startedAt, result.finishedAt ?? fallbackFinishedAt)
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode,
    timedOut: result.timedOut === true,
    channelError: result.channelError === true,
    startedAt,
    finishedAt,
    formatted: result.formatted || formatBody(result),
  }
}

function succeeded(result: Required<AgentCommandResult>): boolean {
  return !result.channelError && !result.timedOut && result.exitCode === 0
}

async function runWithConnectionRetry(
  command: string,
  dependencies: AgentExecutionDependencies,
): Promise<Required<AgentCommandResult>> {
  const startedAt = Date.now()
  const runOnce = async (): Promise<Required<AgentCommandResult>> => {
    try {
      return formatAgentCommandResult(await dependencies.run(command), startedAt, Date.now())
    } catch (error: any) {
      return formatAgentCommandResult({
        stdout: '',
        stderr: error?.message || String(error),
        exitCode: null,
        timedOut: false,
        channelError: true,
      }, startedAt, Date.now())
    }
  }

  const first = await runOnce()
  return first.channelError ? runOnce() : first
}

export async function executeAgentAction(
  action: AgentAction,
  dependencies: AgentExecutionDependencies,
): Promise<AgentActionResult> {
  dependencies.onState?.('awaiting_authorization')
  const authorization = await dependencies.authorize(action.command)
  if (!authorization.allowed) {
    return {
      action,
      status: 'denied',
      denialMessage: authorization.denialMessage,
    }
  }

  dependencies.onState?.('executing')
  const commandResult = await runWithConnectionRetry(action.command, dependencies)
  dependencies.onCompleted?.(action.command, commandResult, authorization, false)
  if (!succeeded(commandResult)) return { action, status: 'failed', commandResult }
  if (!action.verifyCommand) return { action, status: 'completed', commandResult }

  dependencies.onState?.('verifying')
  const verificationAuthorization = await dependencies.authorize(action.verifyCommand)
  if (!verificationAuthorization.allowed) {
    return {
      action,
      status: 'verification_failed',
      commandResult,
      denialMessage: verificationAuthorization.denialMessage,
    }
  }
  const verificationResult = await runWithConnectionRetry(action.verifyCommand, dependencies)
  dependencies.onCompleted?.(
    action.verifyCommand,
    verificationResult,
    verificationAuthorization,
    true,
  )
  return {
    action,
    status: succeeded(verificationResult) ? 'verified' : 'verification_failed',
    commandResult,
    verificationResult,
  }
}
