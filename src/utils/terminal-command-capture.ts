import type { OperationRecordInput, OperationStatus } from './operation-records.ts'

export interface TerminalCommandContext {
  serverId: string
  serverName: string
  sessionId?: string
  cwd?: string
}

export interface TerminalCommandCaptureOptions {
  onComplete: (record: OperationRecordInput) => void
  now?: () => number
}

interface ActiveCapture {
  command: string
  context: TerminalCommandContext
  output: string
  startedAt: number
  pendingStatus: OperationStatus | null
}

const PROMPT_PATTERN = /^[^\r\n]{0,160}[$#>%]\s*$/

export function stripTerminalControls(value: string): string {
  return String(value || '')
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\0/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

function lastNonEmptyLine(value: string): string {
  const lines = value.split('\n')
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (lines[index].trim()) return lines[index].trimEnd()
  }
  return ''
}

function cleanCompletedOutput(value: string, command: string, removePrompt: boolean): string {
  const lines = stripTerminalControls(value).split('\n')
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()

  if (lines.length && lines[0].trim() === command.trim()) lines.shift()
  if (removePrompt && lines.length && PROMPT_PATTERN.test(lines[lines.length - 1].trimEnd())) lines.pop()
  if (lines.length && lines[lines.length - 1].trim() === '^C') lines.pop()

  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  return lines.join('\n')
}

export class TerminalCommandCapture {
  private active: ActiveCapture | null = null
  private readonly onComplete: (record: OperationRecordInput) => void
  private readonly now: () => number

  constructor(options: TerminalCommandCaptureOptions) {
    this.onComplete = options.onComplete
    this.now = options.now || Date.now
  }

  submit(command: string, context: TerminalCommandContext): void {
    const clean = stripTerminalControls(command).trim()
    if (!clean) return
    if (this.active) this.complete('unknown', false)
    this.active = {
      command: clean,
      context: { ...context },
      output: '',
      startedAt: this.now(),
      pendingStatus: null,
    }
  }

  append(data: string): void {
    if (!this.active || !data) return
    this.active.output += data
    const clean = stripTerminalControls(this.active.output)
    if (PROMPT_PATTERN.test(lastNonEmptyLine(clean))) {
      this.complete(this.active.pendingStatus || 'success', true)
    }
  }

  interrupt(): void {
    if (this.active) this.active.pendingStatus = 'interrupted'
  }

  flush(): void {
    if (this.active) this.complete(this.active.pendingStatus || 'unknown', false)
  }

  private complete(status: OperationStatus, removePrompt: boolean): void {
    const active = this.active
    if (!active) return
    this.active = null
    const finishedAt = this.now()
    this.onComplete({
      source: 'terminal',
      serverId: active.context.serverId,
      serverName: active.context.serverName,
      sessionId: active.context.sessionId,
      cwd: active.context.cwd,
      command: active.command,
      output: cleanCompletedOutput(active.output, active.command, removePrompt),
      exitCode: null,
      timedOut: false,
      truncated: false,
      status,
      startedAt: active.startedAt,
      finishedAt,
      durationMs: Math.max(0, finishedAt - active.startedAt),
    })
  }
}
