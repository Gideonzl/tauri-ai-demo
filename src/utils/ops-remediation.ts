import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type RemediationStepStatus =
  | 'pending'
  | 'waiting_approval'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'skipped'

export type RemediationPlanStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'stopped'
export type RemediationIssueType = 'service' | 'disk' | 'process' | 'network' | 'unknown'
export type EvidenceSeverity = 'info' | 'warning' | 'critical'

export interface RemediationEvidence {
  source: string
  summary: string
  severity: EvidenceSeverity
}

export interface RemediationStep {
  id: string
  title: string
  goal: string
  command: string
  verifyCommand: string
  expectedResult: string
  risk: CommandRisk
  stopOnFailure: boolean
  status: RemediationStepStatus
  auditId?: string
  outputSummary?: string
  verificationSummary?: string
}

export interface RemediationPlan {
  id: string
  hostId: string
  hostName: string
  issueType: RemediationIssueType
  title: string
  evidence: RemediationEvidence[]
  steps: RemediationStep[]
  createdAt: number
  status: RemediationPlanStatus
}

export interface RemediationPlanInput {
  hostId: string
  hostName: string
  issueText: string
  diagnosticOutput: string
}

export interface PlanValidationResult {
  valid: boolean
  errors: string[]
}

const SERVICE_NAMES = [
  'nginx',
  'apache2',
  'httpd',
  'mysql',
  'mysqld',
  'mariadb',
  'postgresql',
  'redis',
  'docker',
]

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeText(input: string): string {
  return input.toLowerCase()
}

function detectIssueType(input: RemediationPlanInput): RemediationIssueType {
  const text = normalizeText(`${input.issueText}\n${input.diagnosticOutput}`)
  if (/disk|磁盘|inode|no space|空间|9[0-9]%/.test(text)) return 'disk'
  if (/端口|port|listen|listening|connection|连接/.test(text)) return 'network'
  if (/cpu|memory|内存|进程|process|zombie/.test(text)) return 'process'
  if (/service|systemctl|failed|服务|起不来|nginx|mysql|redis|docker/.test(text)) return 'service'
  return 'unknown'
}

function detectServiceName(input: RemediationPlanInput): string | null {
  const text = normalizeText(`${input.issueText}\n${input.diagnosticOutput}`)
  return SERVICE_NAMES.find(name => new RegExp(`\\b${name}\\b`, 'i').test(text)) || null
}

function buildStep(
  id: string,
  title: string,
  goal: string,
  command: string,
  verifyCommand: string,
  expectedResult: string,
): RemediationStep {
  return {
    id,
    title,
    goal,
    command,
    verifyCommand,
    expectedResult,
    risk: classifyCommand(command).risk,
    stopOnFailure: true,
    status: 'pending',
  }
}

export function validateRemediationPlan(plan: RemediationPlan): PlanValidationResult {
  const errors: string[] = []

  if (!plan.id) errors.push('plan.id is required')
  if (!plan.hostId) errors.push('hostId is required')
  if (!plan.hostName) errors.push('hostName is required')
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push('steps must contain at least one step')

  for (const item of plan.steps || []) {
    const stepLabel = item?.id || '-'
    if (!item?.id) errors.push('step.id is required')
    if (!item?.title?.trim()) errors.push(`step ${stepLabel} title is required`)
    if (!item?.goal?.trim()) errors.push(`step ${stepLabel} goal is required`)
    if (!item?.command?.trim()) errors.push(`step ${stepLabel} command is required`)
    if (!item?.verifyCommand?.trim()) errors.push(`step ${stepLabel} verifyCommand is required`)
    if (!item?.expectedResult?.trim()) errors.push(`step ${stepLabel} expectedResult is required`)
    if (!['pending', 'waiting_approval', 'running', 'verifying', 'completed', 'failed', 'skipped'].includes(item?.status || '')) {
      errors.push(`step ${stepLabel} status is invalid`)
    }

    const commandRisk = classifyCommand(item.command)
    if (commandRisk.risk === 'high_risk' || commandRisk.risk === 'unknown') {
      errors.push(`step ${stepLabel} command must be a safe read-only or change operation`)
    }

    if (classifyCommand(item.verifyCommand).risk !== 'read_only') {
      errors.push(`step ${stepLabel} verifyCommand must be read-only`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function shouldStopAfterStep(item: RemediationStep): boolean {
  return item.stopOnFailure && (item.status === 'failed' || item.status === 'skipped')
}

export function createConservativeRemediationPlan(input: RemediationPlanInput): RemediationPlan {
  const issueType = detectIssueType(input)
  const evidence: RemediationEvidence[] = [{
    source: 'diagnostics',
    summary: input.diagnosticOutput.trim().slice(0, 500) || '当前诊断输出为空，已进入保守模式。',
    severity: issueType === 'unknown' ? 'warning' : 'critical',
  }]

  const steps: RemediationStep[] = []
  const serviceName = detectServiceName(input)

  if (issueType === 'disk') {
    steps.push(
      buildStep(
        'disk-journal-usage',
        '查看日志占用',
        '确认 systemd journal 是否占用过多磁盘',
        'journalctl --disk-usage 2>/dev/null || echo "journalctl unavailable"',
        'df -h && df -i',
        '日志占用可读',
      ),
      buildStep(
        'disk-vacuum-journal',
        '清理旧 journal 日志',
        '只清理 7 天以前的 systemd journal 日志',
        'journalctl --vacuum-time=7d',
        'journalctl --disk-usage && df -h && df -i',
        '日志占用下降，根分区可用空间增加',
      ),
    )
  } else if (issueType === 'service' && serviceName) {
    steps.push(
      buildStep(
        'service-status',
        '复查服务状态',
        `确认 ${serviceName} 当前状态和最近日志`,
        `systemctl status ${serviceName} --no-pager -l | head -80`,
        `systemctl is-active ${serviceName} && systemctl status ${serviceName} --no-pager -l | head -40`,
        '服务状态可读',
      ),
      buildStep(
        'service-restart',
        '重启服务',
        `尝试重启 ${serviceName}`,
        `systemctl restart ${serviceName}`,
        `systemctl is-active ${serviceName} && systemctl status ${serviceName} --no-pager -l | head -40`,
        '服务恢复 active 状态',
      ),
    )
  } else if (issueType === 'network') {
    steps.push(
      buildStep(
        'network-listen',
        '复查监听端口',
        '确认当前监听端口和连接状态',
        'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null',
        'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null',
        '端口监听信息可读',
      ),
    )
  } else if (issueType === 'process') {
    steps.push(
      buildStep(
        'process-top',
        '复查高占用进程',
        '确认 CPU 和内存占用最高的进程',
        'ps aux --sort=-%cpu | head -15 && ps aux --sort=-%mem | head -15',
        'ps aux --sort=-%cpu | head -15',
        '高占用进程信息可读',
      ),
    )
  }

  if (steps.length === 0) {
    steps.push(
      buildStep(
        'safe-context',
        '追加安全诊断',
        '当前证据不足，仅追加只读诊断',
        'uptime && free -h && df -h && ss -tlnp 2>/dev/null | head -40',
        'uptime && free -h && df -h',
        '获得更多上下文',
      ),
    )
  }

  const plan: RemediationPlan = {
    id: createId('ops-remediation'),
    hostId: input.hostId,
    hostName: input.hostName,
    issueType,
    title: issueType === 'unknown' ? '保守自愈诊断计划' : `保守自愈计划：${issueType}`,
    evidence,
    steps,
    createdAt: Date.now(),
    status: 'ready',
  }

  const validation = validateRemediationPlan(plan)
  if (!validation.valid) {
    return {
      ...plan,
      status: 'draft',
    }
  }

  return plan
}
