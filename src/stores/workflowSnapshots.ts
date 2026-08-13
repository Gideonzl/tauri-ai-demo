/**
 * 本地工作流快照。
 *
 * 快照只保存可复用的命令、输出和 AI 结论；凭据内容在进入持久化前会被脱敏。
 */
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'workflow-snapshots'
const MAX_SNAPSHOTS = 200

export interface WorkflowSnapshotCommand {
  command: string
  output?: string
  timestamp?: number
}

export interface WorkflowSnapshot {
  id: string
  title: string
  createdAt: number
  server?: { id: string; name: string }
  commands: WorkflowSnapshotCommand[]
  aiSummary?: string
  filePaths: string[]
  tags: string[]
}

export interface WorkflowSnapshotInput {
  title?: string
  server?: { id: string; name: string }
  commands: WorkflowSnapshotCommand[]
  aiSummary?: string
  filePaths?: string[]
  tags?: string[]
}

function redactText(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, '[REDACTED PRIVATE KEY]')
    .replace(/(password|passphrase|token|api[_-]?key)\s*([:=])\s*([^\s,;]+)/gi, '$1$2 [REDACTED]')
}

function cleanList(values: unknown, limit: number): string[] {
  if (!Array.isArray(values)) return []
  return values
    .filter((value): value is string => typeof value === 'string')
    .map(value => redactText(value.trim()))
    .filter(Boolean)
    .slice(0, limit)
}

export function sanitizeSnapshot(input: WorkflowSnapshot): WorkflowSnapshot {
  return {
    id: input.id,
    title: redactText(input.title).slice(0, 120) || 'Untitled snapshot',
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
    server: input.server && typeof input.server.id === 'string' && typeof input.server.name === 'string'
      ? { id: input.server.id, name: redactText(input.server.name).slice(0, 120) }
      : undefined,
    commands: Array.isArray(input.commands)
      ? input.commands
        .filter((item): item is WorkflowSnapshotCommand => !!item && typeof item.command === 'string')
        .slice(0, 50)
        .map(item => ({
          command: redactText(item.command).slice(0, 20_000),
          output: typeof item.output === 'string' ? redactText(item.output).slice(0, 100_000) : undefined,
          timestamp: Number.isFinite(item.timestamp) ? item.timestamp : undefined,
        }))
      : [],
    aiSummary: typeof input.aiSummary === 'string' ? redactText(input.aiSummary).slice(0, 20_000) : undefined,
    filePaths: cleanList(input.filePaths, 100),
    tags: cleanList(input.tags, 20),
  }
}

function isSnapshot(value: unknown): value is WorkflowSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<WorkflowSnapshot>
  return typeof snapshot.id === 'string'
    && typeof snapshot.title === 'string'
    && typeof snapshot.createdAt === 'number'
    && Array.isArray(snapshot.commands)
}

function loadSnapshots(): WorkflowSnapshot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter(isSnapshot).map(sanitizeSnapshot).slice(0, MAX_SNAPSHOTS)
      : []
  } catch {
    return []
  }
}

export const useWorkflowSnapshotsStore = defineStore('workflowSnapshots', () => {
  const snapshots = ref<WorkflowSnapshot[]>(loadSnapshots())
  const snapshotCount = computed(() => snapshots.value.length)

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots.value))
    } catch (error) {
      console.error('Failed to save workflow snapshots:', error)
    }
  }

  function createSnapshot(input: WorkflowSnapshotInput): WorkflowSnapshot | null {
    const commands = input.commands.filter(item => item.command.trim())
    if (!commands.length) return null
    const snapshot = sanitizeSnapshot({
      id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: input.title?.trim() || commands[0].command.trim().slice(0, 48),
      createdAt: Date.now(),
      server: input.server,
      commands,
      aiSummary: input.aiSummary,
      filePaths: input.filePaths || [],
      tags: input.tags || [],
    })
    snapshots.value.unshift(snapshot)
    snapshots.value = snapshots.value.slice(0, MAX_SNAPSHOTS)
    saveToStorage()
    return snapshot
  }

  function getSnapshot(id: string): WorkflowSnapshot | null {
    return snapshots.value.find(snapshot => snapshot.id === id) || null
  }

  function deleteSnapshot(id: string) {
    snapshots.value = snapshots.value.filter(snapshot => snapshot.id !== id)
    saveToStorage()
  }

  function clearSnapshots() {
    snapshots.value = []
    try { localStorage.removeItem(STORAGE_KEY) } catch {}
  }

  function exportSnapshots(): WorkflowSnapshot[] {
    return snapshots.value.map(snapshot => sanitizeSnapshot(snapshot))
  }

  function importSnapshots(input: unknown): number {
    if (!Array.isArray(input)) return 0
    const valid = input.filter(isSnapshot).map(sanitizeSnapshot)
    if (!valid.length) return 0
    const existingIds = new Set(snapshots.value.map(snapshot => snapshot.id))
    const merged = [...valid.filter(snapshot => !existingIds.has(snapshot.id)), ...snapshots.value]
    snapshots.value = merged.slice(0, MAX_SNAPSHOTS)
    saveToStorage()
    return valid.length
  }

  function reload() {
    snapshots.value = loadSnapshots()
  }

  return {
    snapshots,
    snapshotCount,
    createSnapshot,
    getSnapshot,
    deleteSnapshot,
    clearSnapshots,
    exportSnapshots,
    importSnapshots,
    reload,
  }
})
