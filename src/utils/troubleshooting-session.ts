import { redactOperationText } from './operation-records.ts'

export const TROUBLESHOOTING_STORAGE_KEY = 'ai-troubleshooting-sessions-v1'
export const MAX_TROUBLESHOOTING_SESSIONS = 50
export const MAX_AGENT_ACTIONS = 12
export const MAX_AGENT_MODEL_ROUNDS = 8

export type TroubleshootingState =
  | 'idle'
  | 'assessing'
  | 'collecting'
  | 'awaiting_authorization'
  | 'executing'
  | 'verifying'
  | 'resolved'
  | 'blocked'
  | 'cancelled'

export interface TroubleshootingSession {
  id: string
  conversationId: string
  hostId: string
  hostName: string
  summary: string
  state: TroubleshootingState
  facts?: string[]
  evidenceRecordIds: string[]
  actionCount: number
  modelRoundCount: number
  lastError?: string
  createdAt: number
  updatedAt: number
}

interface StorageReader {
  getItem(key: string): string | null
}

interface StorageWriter extends StorageReader {
  setItem(key: string, value: string): void
}

const VALID_STATES = new Set<TroubleshootingState>([
  'idle',
  'assessing',
  'collecting',
  'awaiting_authorization',
  'executing',
  'verifying',
  'resolved',
  'blocked',
  'cancelled',
])

const transitions: Record<TroubleshootingState, TroubleshootingState[]> = {
  idle: ['assessing', 'cancelled'],
  assessing: ['collecting', 'awaiting_authorization', 'blocked', 'cancelled'],
  collecting: ['awaiting_authorization', 'executing', 'assessing', 'blocked', 'cancelled'],
  awaiting_authorization: ['executing', 'assessing', 'blocked', 'cancelled'],
  executing: ['verifying', 'assessing', 'blocked', 'cancelled'],
  verifying: ['resolved', 'assessing', 'blocked', 'cancelled'],
  resolved: ['assessing', 'cancelled'],
  blocked: ['assessing', 'cancelled'],
  cancelled: ['assessing'],
}

function safeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function safeText(value: unknown, maxLength: number): string {
  return redactOperationText(typeof value === 'string' ? value : '').trim().slice(0, maxLength)
}

function safeTextArray(value: unknown, maxItemLength: number): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => safeText(item, maxItemLength))
    .filter(Boolean)
    .slice(0, 20)
}

export function canTransitionTroubleshooting(from: TroubleshootingState, to: TroubleshootingState): boolean {
  return from === to || transitions[from].includes(to)
}

export function sanitizeTroubleshootingSession(value: unknown): TroubleshootingSession | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<TroubleshootingSession>
  const conversationId = safeText(input.conversationId, 200)
  if (!conversationId) return null
  const createdAt = safeNumber(input.createdAt, Date.now())
  const state = VALID_STATES.has(input.state as TroubleshootingState)
    ? input.state as TroubleshootingState
    : 'idle'

  return {
    id: safeText(input.id, 200) || `issue-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
    conversationId,
    hostId: safeText(input.hostId, 200),
    hostName: safeText(input.hostName, 200),
    summary: safeText(input.summary, 2_000),
    state,
    facts: safeTextArray(input.facts, 1_000),
    evidenceRecordIds: safeTextArray(input.evidenceRecordIds, 200),
    actionCount: Math.max(0, Math.floor(safeNumber(input.actionCount, 0))),
    modelRoundCount: Math.max(0, Math.floor(safeNumber(input.modelRoundCount, 0))),
    lastError: safeText(input.lastError, 2_000) || undefined,
    createdAt,
    updatedAt: safeNumber(input.updatedAt, createdAt),
  }
}

function newestFirst(sessions: TroubleshootingSession[]): TroubleshootingSession[] {
  return sessions
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, MAX_TROUBLESHOOTING_SESSIONS)
}

export function loadTroubleshootingSessions(storage: StorageReader): TroubleshootingSession[] {
  try {
    const raw = storage.getItem(TROUBLESHOOTING_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return newestFirst(parsed
      .map(sanitizeTroubleshootingSession)
      .filter((item): item is TroubleshootingSession => item !== null))
  } catch {
    return []
  }
}

export function saveTroubleshootingSessions(
  storage: StorageWriter,
  sessions: TroubleshootingSession[],
): TroubleshootingSession[] {
  const safe = newestFirst(sessions
    .map(sanitizeTroubleshootingSession)
    .filter((item): item is TroubleshootingSession => item !== null))
  try {
    storage.setItem(TROUBLESHOOTING_STORAGE_KEY, JSON.stringify(safe))
  } catch {
    // Persistence is best effort; an unavailable local store must not block the agent.
  }
  return safe
}
