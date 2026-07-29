import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type OpsRunbookCategory = 'system' | 'disk' | 'network' | 'process' | 'security'
export type OpsRunbookSurface = 'batch' | 'ai'
export type OpsRunbookSource = 'builtin' | 'custom'

export interface OpsRunbook {
  id: string
  category: OpsRunbookCategory
  surfaces: OpsRunbookSurface[]
  source: OpsRunbookSource
  titleKey?: string
  descriptionKey?: string
  title?: string
  description?: string
  command?: string
  promptKey?: string
  recommendedConcurrency: number
  risk: CommandRisk
  createdAt?: number
}

export interface CreateCustomRunbookInput {
  title: string
  description?: string
  command: string
  recommendedConcurrency?: number
}

export interface CustomRunbookValidationResult {
  valid: boolean
  errors: string[]
  runbook?: OpsRunbook
}

const RUNBOOK_DEFINITIONS: Array<Omit<OpsRunbook, 'risk' | 'source'>> = [
  {
    id: 'fleet-health',
    category: 'system',
    surfaces: ['batch', 'ai'],
    titleKey: 'ops.runbookFleetHealth',
    descriptionKey: 'ops.runbookFleetHealthDesc',
    command: 'hostname && uptime && free -h && df -h && df -i',
    promptKey: 'ops.runbookFleetHealthPrompt',
    recommendedConcurrency: 3,
  },
  {
    id: 'disk-pressure',
    category: 'disk',
    surfaces: ['batch', 'ai'],
    titleKey: 'ops.runbookDiskPressure',
    descriptionKey: 'ops.runbookDiskPressureDesc',
    command: 'df -h && df -i && du -xh /var/log 2>/dev/null | sort -h | tail -20',
    promptKey: 'ops.runbookDiskPressurePrompt',
    recommendedConcurrency: 2,
  },
  {
    id: 'network-listeners',
    category: 'network',
    surfaces: ['batch', 'ai'],
    titleKey: 'ops.runbookNetworkListeners',
    descriptionKey: 'ops.runbookNetworkListenersDesc',
    command: 'ip addr && ip route && ss -tlnp 2>/dev/null | head -80',
    promptKey: 'ops.runbookNetworkListenersPrompt',
    recommendedConcurrency: 3,
  },
  {
    id: 'process-pressure',
    category: 'process',
    surfaces: ['batch', 'ai'],
    titleKey: 'ops.runbookProcessPressure',
    descriptionKey: 'ops.runbookProcessPressureDesc',
    command: 'ps aux --sort=-%cpu | head -15 && ps aux --sort=-%mem | head -15',
    promptKey: 'ops.runbookProcessPressurePrompt',
    recommendedConcurrency: 3,
  },
  {
    id: 'login-security',
    category: 'security',
    surfaces: ['batch', 'ai'],
    titleKey: 'ops.runbookLoginSecurity',
    descriptionKey: 'ops.runbookLoginSecurityDesc',
    command: 'who && last -n 20 && lastb -n 20 2>/dev/null',
    promptKey: 'ops.runbookLoginSecurityPrompt',
    recommendedConcurrency: 2,
  },
]

export const OPS_RUNBOOKS: OpsRunbook[] = RUNBOOK_DEFINITIONS.map((runbook) => ({
  ...runbook,
  source: 'builtin',
  risk: runbook.command ? classifyCommand(runbook.command).risk : 'read_only',
}))

export function getBatchRunbooks(): OpsRunbook[] {
  return OPS_RUNBOOKS.filter(runbook => runbook.surfaces.includes('batch') && runbook.command)
}

export function getAiRunbookPrompts(): OpsRunbook[] {
  return OPS_RUNBOOKS.filter(runbook => runbook.surfaces.includes('ai') && runbook.promptKey)
}

export function getRunbookById(id: string): OpsRunbook | undefined {
  return OPS_RUNBOOKS.find(runbook => runbook.id === id)
}

export function isSafeBatchRunbook(runbook: OpsRunbook): boolean {
  return Boolean(runbook.command) && classifyCommand(runbook.command || '').risk === 'read_only'
}

function createId(): string {
  return `custom-runbook-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clampConcurrency(value: number | undefined): number {
  const raw = Number.isFinite(value) ? Number(value) : 2
  return Math.max(1, Math.min(Math.floor(raw), 10))
}

export function createCustomRunbook(input: CreateCustomRunbookInput): CustomRunbookValidationResult {
  const title = input.title.trim().slice(0, 40)
  const command = input.command.trim()
  const description = (input.description || '').trim().slice(0, 120)
  const errors: string[] = []

  if (!title) errors.push('title is required')
  if (!command) errors.push('command is required')

  const classification = classifyCommand(command)
  if (classification.risk !== 'read_only') {
    errors.push(`custom runbook command must be read-only: ${classification.reason}`)
  }

  if (errors.length > 0) return { valid: false, errors }

  return {
    valid: true,
    errors: [],
    runbook: {
      id: createId(),
      source: 'custom',
      category: 'system',
      surfaces: ['batch'],
      title,
      description,
      command,
      recommendedConcurrency: clampConcurrency(input.recommendedConcurrency),
      risk: classification.risk,
      createdAt: Date.now(),
    },
  }
}
