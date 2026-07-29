import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type OrchestrationMode = 'single' | 'batch'
export type OrchestrationTaskType = 'inspection' | 'command' | 'remediation'
export type OrchestrationTaskStatus = 'draft' | 'queued' | 'running' | 'verifying' | 'completed' | 'failed' | 'stopped'
export type OrchestrationTargetStatus = 'pending' | 'connecting' | 'running' | 'completed' | 'failed' | 'skipped'
export type OrchestrationStepStatus = 'pending' | 'waiting_approval' | 'running' | 'verifying' | 'completed' | 'failed' | 'skipped'

export interface OrchestrationTargetInput {
  hostId: string
  hostName: string
  hostAddress: string
  sessionId?: string
}

export interface OrchestrationTarget extends OrchestrationTargetInput {
  status: OrchestrationTargetStatus
  summary?: string
  error?: string
}

export interface OrchestrationStep {
  id: string
  title: string
  command: string
  verifyCommand?: string
  risk: CommandRisk
  stopOnFailure: boolean
  status: OrchestrationStepStatus
  auditId?: string
  outputSummary?: string
  verificationSummary?: string
}

export interface OrchestrationTask {
  id: string
  mode: OrchestrationMode
  taskType: OrchestrationTaskType
  title: string
  concurrency: number
  targets: OrchestrationTarget[]
  steps: OrchestrationStep[]
  status: OrchestrationTaskStatus
  createdAt: number
}

export interface CreateCommandTaskInput {
  mode: OrchestrationMode
  title: string
  command: string
  verifyCommand?: string
  targets: OrchestrationTargetInput[]
  concurrency?: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clampConcurrency(value: number | undefined, targetCount: number): number {
  const fallback = 2
  const raw = Number.isFinite(value) ? Number(value) : fallback
  return Math.max(1, Math.min(Math.floor(raw), Math.max(1, targetCount)))
}

export function createCommandTask(input: CreateCommandTaskInput): OrchestrationTask {
  const risk = classifyCommand(input.command).risk
  return {
    id: createId('ops-orchestration'),
    mode: input.mode,
    taskType: 'command',
    title: input.title,
    concurrency: clampConcurrency(input.concurrency, input.targets.length),
    targets: input.targets.map(target => ({ ...target, status: 'pending' })),
    steps: [{
      id: 'command-main',
      title: input.title,
      command: input.command,
      verifyCommand: input.verifyCommand,
      risk,
      stopOnFailure: risk !== 'read_only',
      status: 'pending',
    }],
    status: 'queued',
    createdAt: Date.now(),
  }
}

export function validateOrchestrationTask(task: OrchestrationTask): ValidationResult {
  const errors: string[] = []

  if (!task.id) errors.push('task.id is required')
  if (!task.title?.trim()) errors.push('title is required')
  if (!Array.isArray(task.targets) || task.targets.length === 0) errors.push('targets must contain at least one host')
  if (!Array.isArray(task.steps) || task.steps.length === 0) errors.push('steps must contain at least one step')
  if (task.concurrency < 1) errors.push('concurrency must be at least 1')
  if (task.concurrency > Math.max(1, task.targets.length)) errors.push('concurrency cannot exceed target count')

  for (const target of task.targets || []) {
    if (!target.hostId) errors.push('target.hostId is required')
    if (!target.hostName) errors.push('target.hostName is required')
    if (!target.hostAddress) errors.push('target.hostAddress is required')
  }

  for (const step of task.steps || []) {
    const stepLabel = step?.id || '-'
    if (!step?.id) errors.push('step.id is required')
    if (!step?.command?.trim()) errors.push(`step ${stepLabel} command is required`)
    const risk = classifyCommand(step.command || '').risk
    if (risk === 'high_risk') errors.push(`step ${stepLabel} high-risk command requires explicit runtime confirmation`)
    if (risk !== 'read_only' && !step.verifyCommand?.trim()) errors.push(`step ${stepLabel} verifyCommand is required for change steps`)
    if (step.verifyCommand && classifyCommand(step.verifyCommand).risk !== 'read_only') errors.push(`step ${stepLabel} verifyCommand must be read-only`)
  }

  return { valid: errors.length === 0, errors }
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const safeLimit = Math.max(1, Math.floor(limit))
  let cursor = 0

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, () => runNext())
  await Promise.all(runners)
  return results
}

export function shouldStopRemaining(task: OrchestrationTask, failed: OrchestrationStep | OrchestrationTarget): boolean {
  if ('command' in failed) {
    return failed.stopOnFailure && failed.status === 'failed' && failed.risk !== 'read_only'
  }

  const hasChangeStep = task.steps.some(step => step.risk !== 'read_only')
  return hasChangeStep && failed.status === 'failed'
}

export function summarizeOrchestration(task: OrchestrationTask): string {
  return task.targets.map((target) => {
    const detail = target.error || target.summary || '-'
    return `${target.hostName} [${target.status}]\n${detail}`
  }).join('\n\n')
}
