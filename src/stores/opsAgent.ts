import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  classifyCommand,
  evaluateCommand,
  type CustomPermissionRule,
  type PermissionDecision,
  type PermissionLevel,
} from '@/utils/ops-permission'

export interface AuditEvent {
  id: string
  createdAt: number
  hostId: string
  hostName: string
  command: string
  decision: PermissionDecision
  approved: boolean | null
  status: 'pending' | 'denied' | 'completed' | 'failed'
  outputSummary: string
}

const PERMISSION_KEY = 'ops-agent-permission'
const RULES_KEY = 'ops-agent-rules'
const AUDIT_KEY = 'ops-agent-audit'
const MAX_AUDIT_EVENTS = 200
const AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : fallback
  } catch {
    return fallback
  }
}

function validPermissionLevel(value: unknown): value is PermissionLevel {
  return value === 'readonly' || value === 'controlled' || value === 'elevated' || value === 'custom'
}

function sanitizeRules(value: unknown): CustomPermissionRule[] {
  if (!Array.isArray(value)) return []
  return value.filter((rule): rule is CustomPermissionRule => (
    typeof rule?.id === 'string'
    && typeof rule?.pattern === 'string'
    && ['allow', 'confirm', 'deny'].includes(rule?.action)
    && Array.isArray(rule?.hostIds)
    && typeof rule?.enabled === 'boolean'
  ))
}

function sanitizeAudit(value: unknown): AuditEvent[] {
  if (!Array.isArray(value)) return []
  const cutoff = Date.now() - AUDIT_RETENTION_MS
  return value.filter((event): event is AuditEvent => (
    typeof event?.id === 'string'
    && typeof event?.createdAt === 'number'
    && event.createdAt >= cutoff
    && typeof event?.hostId === 'string'
    && typeof event?.hostName === 'string'
    && typeof event?.command === 'string'
    && typeof event?.outputSummary === 'string'
    && typeof event?.decision?.risk === 'string'
    && typeof event?.decision?.action === 'string'
  )).slice(0, MAX_AUDIT_EVENTS)
}

function saveStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local persistence must not prevent a user-approved command from running.
  }
}

function createId(): string {
  return `ops-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Strip secrets and cap audit output so stored history never becomes a raw log archive. */
export function summarizeOutput(value: string): string {
  return value
    .replace(/\b(password|token|secret|authorization)\b\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500)
}

export const useOpsAgentStore = defineStore('opsAgent', () => {
  const savedLevel = readStorage<unknown>(PERMISSION_KEY, 'controlled')
  const permissionLevel = ref<PermissionLevel>(validPermissionLevel(savedLevel) ? savedLevel : 'controlled')
  const rules = ref<CustomPermissionRule[]>(sanitizeRules(readStorage<unknown>(RULES_KEY, [])))
  const auditEvents = ref<AuditEvent[]>(sanitizeAudit(readStorage<unknown>(AUDIT_KEY, [])))

  const recentAuditEvents = computed(() => [...auditEvents.value].sort((a, b) => b.createdAt - a.createdAt))

  function persistAudit() {
    const cutoff = Date.now() - AUDIT_RETENTION_MS
    auditEvents.value = auditEvents.value
      .filter(event => event.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_AUDIT_EVENTS)
    saveStorage(AUDIT_KEY, auditEvents.value)
  }

  function setPermissionLevel(level: PermissionLevel) {
    permissionLevel.value = level
    saveStorage(PERMISSION_KEY, level)
  }

  function setRules(nextRules: CustomPermissionRule[]) {
    rules.value = sanitizeRules(nextRules)
    saveStorage(RULES_KEY, rules.value)
  }

  function decide(command: string, hostId: string): PermissionDecision {
    return evaluateCommand(classifyCommand(command), permissionLevel.value, rules.value, hostId)
  }

  function recordAudit(input: Omit<AuditEvent, 'id' | 'createdAt' | 'outputSummary'> & { outputSummary?: string }): string {
    const id = createId()
    auditEvents.value.unshift({
      ...input,
      id,
      createdAt: Date.now(),
      command: summarizeOutput(input.command),
      outputSummary: summarizeOutput(input.outputSummary || ''),
    })
    persistAudit()
    return id
  }

  function completeAudit(id: string, result: string) {
    const event = auditEvents.value.find(item => item.id === id)
    if (!event) return
    event.outputSummary = summarizeOutput(result)
    event.status = /^\[执行错误\]/.test(result.trim()) ? 'failed' : 'completed'
    persistAudit()
  }

  function clearAudit() {
    auditEvents.value = []
    saveStorage(AUDIT_KEY, auditEvents.value)
  }

  return {
    permissionLevel,
    rules,
    auditEvents: recentAuditEvents,
    setPermissionLevel,
    setRules,
    decide,
    recordAudit,
    completeAudit,
    clearAudit,
  }
})
