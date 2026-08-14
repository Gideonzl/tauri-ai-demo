export const OPERATION_RECORDS_KEY = 'operation-records-v1'
export const LEGACY_COMMAND_HISTORY_KEY = 'cmd-history'
export const MAX_OPERATION_RECORDS = 200
export const MAX_OPERATION_OUTPUT = 32 * 1024

export type OperationSource = 'terminal' | 'ai' | 'script' | 'batch'
export type OperationStatus = 'running' | 'success' | 'failed' | 'interrupted' | 'unknown'

export interface OperationRecord {
  id: string
  source: OperationSource
  serverId: string
  serverName: string
  sessionId?: string
  command: string
  cwd?: string
  output: string
  stderr?: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
  status: OperationStatus
  startedAt: number
  finishedAt?: number
  durationMs?: number
}

export type OperationRecordInput = Partial<OperationRecord> & Pick<OperationRecord, 'command' | 'serverId' | 'serverName'>

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void
}

const VALID_SOURCES = new Set<OperationSource>(['terminal', 'ai', 'script', 'batch'])
const VALID_STATUSES = new Set<OperationStatus>(['running', 'success', 'failed', 'interrupted', 'unknown'])

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function redactOperationText(value: string): string {
  return String(value || '')
    .replace(/\0/g, '')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/(authorization\s*:\s*)(?:bearer\s+)?[^\s"']+/gi, '$1[REDACTED]')
    .replace(/\b(password|passphrase|token|api[_-]?key|secret)\s*([:=])\s*([^\s,;]+)/gi, '$1$2[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[REDACTED]@')
}

function limitedOutput(value: unknown): { output: string; truncated: boolean } {
  const clean = redactOperationText(typeof value === 'string' ? value : '')
  if (clean.length <= MAX_OPERATION_OUTPUT) return { output: clean, truncated: false }
  return { output: clean.slice(-MAX_OPERATION_OUTPUT), truncated: true }
}

export function sanitizeOperationRecord(input: OperationRecordInput): OperationRecord {
  const startedAt = safeNumber(input.startedAt, Date.now())
  const finishedAt = typeof input.finishedAt === 'number' && Number.isFinite(input.finishedAt)
    ? input.finishedAt
    : undefined
  const output = limitedOutput(input.output)
  const stderr = typeof input.stderr === 'string' ? limitedOutput(input.stderr).output : undefined
  const source = VALID_SOURCES.has(input.source as OperationSource) ? input.source as OperationSource : 'terminal'
  const status = VALID_STATUSES.has(input.status as OperationStatus) ? input.status as OperationStatus : 'unknown'

  return {
    id: typeof input.id === 'string' && input.id ? input.id : `op-${startedAt}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    serverId: String(input.serverId || ''),
    serverName: redactOperationText(input.serverName).slice(0, 160),
    sessionId: typeof input.sessionId === 'string' && input.sessionId ? input.sessionId : undefined,
    command: redactOperationText(input.command).trim().slice(0, 20_000),
    cwd: typeof input.cwd === 'string' ? redactOperationText(input.cwd).slice(0, 4_096) : undefined,
    output: output.output,
    stderr,
    exitCode: typeof input.exitCode === 'number' && Number.isInteger(input.exitCode) ? input.exitCode : null,
    timedOut: input.timedOut === true,
    truncated: input.truncated === true || output.truncated,
    status,
    startedAt,
    finishedAt,
    durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
      ? Math.max(0, input.durationMs)
      : finishedAt === undefined ? undefined : Math.max(0, finishedAt - startedAt),
  }
}

function isRecordLike(value: unknown): value is OperationRecordInput {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<OperationRecord>
  return typeof candidate.serverId === 'string'
    && typeof candidate.serverName === 'string'
    && typeof candidate.command === 'string'
}

function parseArray(raw: string | null): unknown[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function newestFirst(records: OperationRecord[]): OperationRecord[] {
  return records.sort((left, right) => right.startedAt - left.startedAt).slice(0, MAX_OPERATION_RECORDS)
}

export function loadOperationRecords(storage: StorageReader & Partial<StorageWriter>): OperationRecord[] {
  const currentRaw = storage.getItem(OPERATION_RECORDS_KEY)
  if (currentRaw !== null) {
    return newestFirst(parseArray(currentRaw).filter(isRecordLike).map(sanitizeOperationRecord))
  }

  const migrated = newestFirst(parseArray(storage.getItem(LEGACY_COMMAND_HISTORY_KEY))
    .filter(isRecordLike)
    .map(item => sanitizeOperationRecord({
      ...item,
      source: 'terminal',
      output: '',
      exitCode: null,
      timedOut: false,
      truncated: false,
      status: 'unknown',
      startedAt: safeNumber((item as { timestamp?: unknown }).timestamp, Date.now()),
    })))

  if (migrated.length && typeof storage.setItem === 'function') {
    try { storage.setItem(OPERATION_RECORDS_KEY, JSON.stringify(migrated)) } catch { /* persistence is best effort */ }
  }
  return migrated
}

export function saveOperationRecords(storage: StorageWriter, records: OperationRecordInput[]): OperationRecord[] {
  const safe = newestFirst(records.filter(isRecordLike).map(sanitizeOperationRecord))
  try { storage.setItem(OPERATION_RECORDS_KEY, JSON.stringify(safe)) } catch { /* terminal use must continue */ }
  return safe
}

export function formatOperationForAi(record: OperationRecordInput): string {
  const safe = sanitizeOperationRecord(record)
  const state = safe.exitCode === null ? safe.status : `${safe.status} (exit ${safe.exitCode})`
  const duration = safe.durationMs === undefined ? 'unknown' : `${safe.durationMs} ms`
  const output = safe.output || '[命令完成，无输出]'
  return [
    `[终端操作] ${safe.serverName}`,
    `命令：${safe.command}`,
    safe.cwd ? `目录：${safe.cwd}` : '',
    `状态：${state}`,
    `耗时：${duration}`,
    safe.truncated ? '提示：输出过长，以下仅保留末尾内容。' : '',
    '输出：',
    '```text',
    output,
    '```',
    '请分析这条命令及其输出，说明结果、异常和建议的下一步。',
  ].filter(Boolean).join('\n')
}
