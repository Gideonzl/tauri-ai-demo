import {
  redactOperationText,
  type OperationRecord,
} from './operation-records.ts'
import type { PermissionLevel } from './ops-permission.ts'
import type { TroubleshootingSession } from './troubleshooting-session.ts'

export const MAX_AGENT_CONTEXT_TEXT = 24 * 1024
export const MAX_AGENT_CONTEXT_OPERATIONS = 8
export const MAX_AGENT_OPERATION_OUTPUT = 4 * 1024

export type AgentWorkspaceView =
  | 'terminal'
  | 'files'
  | 'logs'
  | 'ops'
  | 'scripts'
  | 'history'
  | 'unknown'

export type AgentOperationContext = Pick<
  OperationRecord,
  | 'id'
  | 'source'
  | 'serverId'
  | 'serverName'
  | 'command'
  | 'cwd'
  | 'output'
  | 'stderr'
  | 'exitCode'
  | 'timedOut'
  | 'truncated'
  | 'status'
  | 'startedAt'
>

export interface AgentContextSnapshot {
  capturedAt: number
  host: {
    id: string
    name: string
    address: string
    port: number
    username: string
    connectionStatus: string
    sessionGeneration?: number
  } | null
  workspace: {
    view: AgentWorkspaceView
    cwd?: string
    selectedPath?: string
    selectedScriptId?: string
  }
  recentOperations: AgentOperationContext[]
  activeIssue: Pick<TroubleshootingSession, 'id' | 'summary' | 'state' | 'facts' | 'lastError'> | null
  permission: { level: PermissionLevel }
}

export interface BuildAgentContextInput {
  capturedAt?: number
  host: AgentContextSnapshot['host']
  workspace: AgentContextSnapshot['workspace']
  operations: OperationRecord[]
  activeIssue: TroubleshootingSession | null
  permissionLevel: PermissionLevel
}

function redactAgentText(value: unknown, maxLength: number): string {
  return redactOperationText(typeof value === 'string' ? value : '')
    .replace(/(cookie\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]')
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s/@]+:[^\s/@]+@/gi, match => {
      const protocol = match.slice(0, match.indexOf('://') + 3)
      return `${protocol}[REDACTED]@`
    })
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED AWS KEY]')
    .replace(/\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSPHRASE)\s*=\s*[^\s,;]+/gi, '[REDACTED CREDENTIAL]')
    .trim()
    .slice(0, maxLength)
}

function sanitizeOperation(record: OperationRecord): AgentOperationContext {
  return {
    id: redactAgentText(record.id, 200),
    source: record.source,
    serverId: redactAgentText(record.serverId, 200),
    serverName: redactAgentText(record.serverName, 200),
    command: redactAgentText(record.command, 4_000),
    cwd: record.cwd ? redactAgentText(record.cwd, 1_000) : undefined,
    output: redactAgentText(record.output, MAX_AGENT_OPERATION_OUTPUT),
    stderr: record.stderr ? redactAgentText(record.stderr, MAX_AGENT_OPERATION_OUTPUT) : undefined,
    exitCode: record.exitCode,
    timedOut: record.timedOut,
    truncated: record.truncated || record.output.length > MAX_AGENT_OPERATION_OUTPUT,
    status: record.status,
    startedAt: record.startedAt,
  }
}

function selectOperations(records: OperationRecord[], hostId: string): OperationRecord[] {
  const newest = records
    .filter(record => record.serverId === hostId)
    .sort((left, right) => right.startedAt - left.startedAt)
  const abnormal = newest
    .filter(record => record.status === 'failed' || record.status === 'interrupted' || record.timedOut)
    .slice(0, 3)
  const selected = [...abnormal, ...newest]
  const unique = new Map<string, OperationRecord>()
  for (const record of selected) {
    if (!unique.has(record.id)) unique.set(record.id, record)
    if (unique.size >= MAX_AGENT_CONTEXT_OPERATIONS) break
  }
  return [...unique.values()].sort((left, right) => right.startedAt - left.startedAt)
}

export function buildAgentContext(input: BuildAgentContextInput): AgentContextSnapshot {
  const host = input.host
    ? {
        id: redactAgentText(input.host.id, 200),
        name: redactAgentText(input.host.name, 200),
        address: redactAgentText(input.host.address, 300),
        port: Number.isFinite(input.host.port) ? input.host.port : 22,
        username: redactAgentText(input.host.username, 200),
        connectionStatus: redactAgentText(input.host.connectionStatus, 100),
        sessionGeneration: input.host.sessionGeneration,
      }
    : null

  const activeIssue = input.activeIssue
    ? {
        id: redactAgentText(input.activeIssue.id, 200),
        summary: redactAgentText(input.activeIssue.summary, 2_000),
        state: input.activeIssue.state,
        facts: (input.activeIssue.facts || []).map(fact => redactAgentText(fact, 1_000)).filter(Boolean).slice(0, 20),
        lastError: input.activeIssue.lastError
          ? redactAgentText(input.activeIssue.lastError, 2_000)
          : undefined,
      }
    : null

  return {
    capturedAt: input.capturedAt ?? Date.now(),
    host,
    workspace: {
      view: input.workspace.view,
      cwd: input.workspace.cwd ? redactAgentText(input.workspace.cwd, 1_000) : undefined,
      selectedPath: input.workspace.selectedPath
        ? redactAgentText(input.workspace.selectedPath, 1_000)
        : undefined,
      selectedScriptId: input.workspace.selectedScriptId
        ? redactAgentText(input.workspace.selectedScriptId, 200)
        : undefined,
    },
    recentOperations: host
      ? selectOperations(input.operations, input.host!.id).map(sanitizeOperation)
      : [],
    activeIssue,
    permission: { level: input.permissionLevel },
  }
}

function renderContext(snapshot: AgentContextSnapshot, operations: AgentOperationContext[]): string {
  const hostLines = snapshot.host
    ? [
        `主机：${snapshot.host.name} (${snapshot.host.username}@${snapshot.host.address}:${snapshot.host.port})`,
        `连接：${snapshot.host.connectionStatus}`,
      ]
    : ['主机：未连接']
  const workspace = [
    `当前模块：${snapshot.workspace.view}`,
    snapshot.workspace.cwd ? `工作目录：${snapshot.workspace.cwd}` : '',
    snapshot.workspace.selectedPath ? `选择路径：${snapshot.workspace.selectedPath}` : '',
    snapshot.workspace.selectedScriptId ? `选择脚本：${snapshot.workspace.selectedScriptId}` : '',
  ].filter(Boolean)
  const issue = snapshot.activeIssue
    ? [
        `当前任务：${snapshot.activeIssue.summary}`,
        `任务状态：${snapshot.activeIssue.state}`,
        snapshot.activeIssue.facts?.length ? `已知事实：${snapshot.activeIssue.facts.join('；')}` : '',
        snapshot.activeIssue.lastError ? `最近错误：${snapshot.activeIssue.lastError}` : '',
      ].filter(Boolean)
    : []
  const operationLines = operations.flatMap((record, index) => [
    `操作 ${index + 1} [${record.status}] ${record.command}`,
    record.cwd ? `目录：${record.cwd}` : '',
    `退出码：${record.exitCode ?? '未知'}；超时：${record.timedOut ? '是' : '否'}；输出截断：${record.truncated ? '是' : '否'}`,
    record.stderr ? `stderr：\n${record.stderr}` : '',
    `输出：\n${record.output || '[命令完成，无输出]'}`,
  ].filter(Boolean))

  return [
    '=== 当前运维上下文（系统自动采集） ===',
    ...hostLines,
    ...workspace,
    `权限等级：${snapshot.permission.level}`,
    ...issue,
    operations.length ? '最近操作：' : '最近操作：无',
    ...operationLines,
    '=== 上下文结束 ===',
  ].join('\n')
}

export function formatAgentContext(snapshot: AgentContextSnapshot): string {
  const operations = snapshot.recentOperations.map(record => ({ ...record }))
  let formatted = renderContext(snapshot, operations)
  while (formatted.length > MAX_AGENT_CONTEXT_TEXT && operations.length > 1) {
    operations.pop()
    formatted = renderContext(snapshot, operations)
  }
  if (formatted.length > MAX_AGENT_CONTEXT_TEXT && operations.length === 1) {
    const overflow = formatted.length - MAX_AGENT_CONTEXT_TEXT
    operations[0].output = operations[0].output.slice(0, Math.max(0, operations[0].output.length - overflow - 64))
    operations[0].truncated = true
    formatted = renderContext(snapshot, operations)
  }
  return formatted.slice(0, MAX_AGENT_CONTEXT_TEXT)
}
