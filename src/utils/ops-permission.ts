/**
 * 运维智能体命令权限策略。
 *
 * 这是前端的第一道安全边界：所有 AI 工具命令先在此分类，再由调用方
 * 决定自动执行、单次确认、二次确认或拒绝。高风险命令永远不能被自定义
 * 规则降级为自动执行。
 */

export type PermissionLevel = 'readonly' | 'controlled' | 'elevated' | 'custom'
export type CommandRisk = 'read_only' | 'change' | 'high_risk' | 'unknown'
export type PermissionAction = 'allow' | 'confirm' | 'double_confirm' | 'deny'

export interface CommandClassification {
  command: string
  risk: CommandRisk
  reason: string
}

export interface CustomPermissionRule {
  id: string
  /** JavaScript regular expression source, matched case-insensitively against the full command. */
  pattern: string
  action: Exclude<PermissionAction, 'double_confirm'>
  /** Empty means every host; otherwise rule only applies to listed host IDs. */
  hostIds: string[]
  enabled: boolean
}

export interface PermissionDecision extends CommandClassification {
  action: PermissionAction
  source: 'builtin' | 'custom'
}

const HIGH_RISK_PATTERNS: RegExp[] = [
  /\brm\s+-[^\n;&|]*(?:r|f)/i,
  /\bmkfs(?:\.\w+)?\b/i,
  /\bdd\b[^\n;&|]*\bof\s*=/i,
  /\b(?:fdisk|parted|wipefs|sgdisk)\b/i,
  /:\s*\(\s*\)\s*\{\s*:\s*\|/,
  /\b(?:shutdown|reboot|halt|poweroff)\b/i,
  /\b(?:iptables\s+-f|nft\s+flush|ufw\s+reset)\b/i,
  /\bdrop\s+(?:database|table)\b|\btruncate\s+table\b/i,
  /\b(?:userdel|groupdel|deluser)\b/i,
  /\b(?:chmod|chown)\s+-r\b/i,
  /(?:^|[;&|])\s*(?:sudo\s+)?(?:systemctl|service)\s+(?:stop|disable|mask)\b/i,
  /(?:^|[;&|])\s*(?:sudo\s+)?(?:killall|pkill)\s+-9\b/i,
  />\s*\/dev\/(?:sd[a-z]|nvme\d|mapper)\b/i,
  /\bcurl\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash)\b/i,
  /\bwget\b[^\n|]*\|\s*(?:sudo\s+)?(?:sh|bash)\b/i,
]

const CHANGE_PATTERNS: RegExp[] = [
  /(?:^|[;&|])\s*(?:sudo\s+)?(?:systemctl|service)\s+(?:start|restart|reload|enable|daemon-reload)\b/i,
  /\b(?:apt(?:-get)?|yum|dnf|apk|pacman)\s+(?:install|remove|upgrade|update)\b/i,
  /\b(?:docker|podman)\s+(?:run|start|stop|restart|rm|compose\s+(?:up|down|restart))\b/i,
  /\b(?:chmod|chown|chgrp|usermod|groupmod|passwd)\b/i,
  /\bsed\s+-i\b/i,
  /\btee\b/i,
  /(?:^|[^0-9])>{1,2}\s*(?!\/dev\/null\b)/,
  /\b(?:mkdir|touch|cp|mv|ln|install)\b/i,
]

const READ_ONLY_COMMANDS = new Set([
  'cat', 'cd', 'cut', 'date', 'df', 'diff', 'du', 'echo', 'env', 'find', 'free',
  'grep', 'head', 'hostname', 'id', 'ip', 'journalctl', 'last', 'lastb', 'ls',
  'lscpu', 'mount', 'netstat', 'nproc', 'ps', 'pwd', 'sort', 'ss', 'stat',
  'systemctl', 'tail', 'top', 'uname', 'uptime', 'wc', 'who', 'whoami', 'awk',
])

function commandStartsReadOnly(segment: string): boolean {
  const normalized = segment.trim().replace(/^(?:command|env)\s+/, '')
  const withoutSudo = normalized.replace(/^sudo\s+/, '')
  const command = withoutSudo.match(/^([a-z0-9_.-]+)/i)?.[1]?.toLowerCase()
  if (!command || !READ_ONLY_COMMANDS.has(command)) return false

  if (command === 'systemctl') return /^systemctl\s+(?:status|is-active|list-units|show)\b/i.test(withoutSudo)
  if (command === 'find') return !/\s-(?:delete|execdir?)\b/i.test(withoutSudo)
  if (command === 'ip') return /^ip\s+(?:addr|route|link|neigh)\b/i.test(withoutSudo)
  if (command === 'journalctl') return !/\s--vacuum-/i.test(withoutSudo)
  return true
}

function allSegmentsReadOnly(command: string): boolean {
  const segments = command.split(/(?:&&|\|\||;|\|)/).map(segment => segment.trim()).filter(Boolean)
  return segments.length > 0 && segments.every(commandStartsReadOnly)
}

function baseDecision(classification: CommandClassification, level: Exclude<PermissionLevel, 'custom'>): PermissionAction {
  if (level === 'readonly') return classification.risk === 'read_only' ? 'allow' : 'deny'
  if (classification.risk === 'read_only') return 'allow'
  if (classification.risk === 'high_risk') return 'double_confirm'
  return 'confirm'
}

function matchesRule(rule: CustomPermissionRule, command: string, hostId: string): boolean {
  if (!rule.enabled || (rule.hostIds.length > 0 && !rule.hostIds.includes(hostId))) return false
  try {
    return new RegExp(rule.pattern, 'i').test(command)
  } catch {
    return false
  }
}

/** Classify without executing or parsing shell output. The most severe match always wins. */
export function classifyCommand(command: string): CommandClassification {
  const normalized = command.trim()
  if (!normalized) return { command, risk: 'unknown', reason: '命令为空，无法安全判定' }

  if (HIGH_RISK_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { command, risk: 'high_risk', reason: '命令可能删除数据、改变访问权限、影响网络或中断服务' }
  }
  if (CHANGE_PATTERNS.some(pattern => pattern.test(normalized))) {
    return { command, risk: 'change', reason: '命令会修改服务器状态、配置或运行中的服务' }
  }
  if (allSegmentsReadOnly(normalized)) {
    return { command, risk: 'read_only', reason: '命令仅采集系统、服务、日志或网络信息' }
  }
  return { command, risk: 'unknown', reason: '无法可靠确认命令没有副作用' }
}

/** Turn a classification and the selected level into an enforceable policy decision. */
export function evaluateCommand(
  classification: CommandClassification,
  level: PermissionLevel,
  rules: CustomPermissionRule[],
  hostId: string = '',
): PermissionDecision {
  // High-risk actions remain protected regardless of policy configuration.
  if (classification.risk === 'high_risk') {
    return { ...classification, action: 'double_confirm', source: 'builtin' }
  }

  if (level === 'custom') {
    const matching = rules
      .filter(rule => matchesRule(rule, classification.command, hostId))
      .sort((a, b) => b.pattern.length - a.pattern.length)[0]
    if (matching) return { ...classification, action: matching.action, source: 'custom' }
    return { ...classification, action: baseDecision(classification, 'controlled'), source: 'builtin' }
  }

  return { ...classification, action: baseDecision(classification, level), source: 'builtin' }
}
