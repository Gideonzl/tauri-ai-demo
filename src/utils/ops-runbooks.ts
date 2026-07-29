import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type OpsRunbookCategory = 'system' | 'disk' | 'network' | 'process' | 'security'
export type OpsRunbookSurface = 'batch' | 'ai'

export interface OpsRunbook {
  id: string
  category: OpsRunbookCategory
  surfaces: OpsRunbookSurface[]
  titleKey: string
  descriptionKey: string
  command?: string
  promptKey?: string
  recommendedConcurrency: number
  risk: CommandRisk
}

const RUNBOOK_DEFINITIONS: Array<Omit<OpsRunbook, 'risk'>> = [
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
