const ACTION_OPEN = '<agent_action>'
const ACTION_CLOSE = '</agent_action>'
const LEGACY_OPEN = '<execute_command>'
const LEGACY_CLOSE = '</execute_command>'

export interface AgentAction {
  id: string
  kind: 'command'
  command: string
  purpose: string
  verifyCommand?: string
  protocol: 'structured' | 'legacy'
}

export interface AgentResponse {
  displayMarkdown: string
  status: 'informational' | 'needs_action' | 'resolved' | 'blocked'
  conclusion?: string
  evidence: string[]
  actions: AgentAction[]
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function parseStructuredActions(content: string): AgentAction[] {
  const actions: AgentAction[] = []
  const pattern = /<agent_action>\s*([\s\S]*?)\s*<\/agent_action>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    try {
      const value: unknown = JSON.parse(match[1])
      if (!value || typeof value !== 'object') continue
      const candidate = value as Record<string, unknown>
      const command = cleanText(candidate.command, 20_000)
      const purpose = cleanText(candidate.purpose, 2_000)
      if (candidate.kind !== 'command' || !command || !purpose) continue
      actions.push({
        id: cleanText(candidate.id, 200) || `action-${actions.length + 1}`,
        kind: 'command',
        command,
        purpose,
        verifyCommand: cleanText(candidate.verifyCommand, 20_000) || undefined,
        protocol: 'structured',
      })
    } catch {
      // Malformed machine blocks remain non-executable and are hidden from display.
    }
  }
  return actions
}

function parseLegacyActions(content: string, offset: number): AgentAction[] {
  const actions: AgentAction[] = []
  const pattern = /<execute_command>\s*([\s\S]*?)\s*<\/execute_command>/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) !== null) {
    const command = cleanText(match[1], 20_000)
    if (!command) continue
    actions.push({
      id: `action-${offset + actions.length + 1}`,
      kind: 'command',
      command,
      purpose: '执行模型请求的诊断命令',
      protocol: 'legacy',
    })
  }
  return actions
}

function displayText(content: string): string {
  return content
    .replace(/<agent_action>[\s\S]*?<\/agent_action>/gi, '')
    .replace(/<execute_command>[\s\S]*?<\/execute_command>/gi, '')
    .replace(/<agent_action>[\s\S]*$/gi, '')
    .replace(/<execute_command>[\s\S]*$/gi, '')
    .trim()
}

export function parseAgentResponse(content: string): AgentResponse {
  const structured = parseStructuredActions(content)
  const actions = [...structured, ...parseLegacyActions(content, structured.length)]
  const visible = displayText(content)
  const conclusion = visible.match(/(?:^|\n)\s*结论[：:]\s*(.+)/)?.[1]?.trim()
  const evidence = visible
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => /^(?:证据[：:]|[-*]\s*证据)/.test(line))
    .slice(0, 5)
    .map(line => line.replace(/^(?:证据[：:]|[-*]\s*证据[：:]?)\s*/, ''))
    .filter(Boolean)
  const status: AgentResponse['status'] = actions.length
    ? 'needs_action'
    : /无法继续|受阻/.test(visible)
      ? 'blocked'
      : /已解决|问题解决/.test(visible)
        ? 'resolved'
        : 'informational'
  return { displayMarkdown: visible, status, conclusion, evidence, actions }
}

function longestSuffixPrefix(value: string, candidates: string[]): number {
  const maxLength = Math.min(value.length, Math.max(...candidates.map(item => item.length - 1)))
  for (let length = maxLength; length > 0; length--) {
    const suffix = value.slice(-length)
    if (candidates.some(candidate => candidate.startsWith(suffix))) return length
  }
  return 0
}

function earliestOpening(value: string): { index: number; open: string; close: string } | null {
  const candidates = [
    { open: ACTION_OPEN, close: ACTION_CLOSE },
    { open: LEGACY_OPEN, close: LEGACY_CLOSE },
  ]
    .map(candidate => ({ ...candidate, index: value.indexOf(candidate.open) }))
    .filter(candidate => candidate.index >= 0)
    .sort((left, right) => left.index - right.index)
  return candidates[0] || null
}

export class AgentActionStreamFilter {
  private buffer = ''
  private hiddenClose: string | null = null

  push(chunk: string): string {
    this.buffer += chunk
    let visible = ''
    while (this.buffer) {
      if (this.hiddenClose) {
        const closeIndex = this.buffer.indexOf(this.hiddenClose)
        if (closeIndex < 0) {
          const retained = longestSuffixPrefix(this.buffer, [this.hiddenClose])
          this.buffer = retained ? this.buffer.slice(-retained) : ''
          break
        }
        this.buffer = this.buffer.slice(closeIndex + this.hiddenClose.length)
        this.hiddenClose = null
        continue
      }

      const opening = earliestOpening(this.buffer)
      if (opening) {
        visible += this.buffer.slice(0, opening.index)
        this.buffer = this.buffer.slice(opening.index + opening.open.length)
        this.hiddenClose = opening.close
        continue
      }

      const retained = longestSuffixPrefix(this.buffer, [ACTION_OPEN, LEGACY_OPEN])
      const emitLength = this.buffer.length - retained
      visible += this.buffer.slice(0, emitLength)
      this.buffer = this.buffer.slice(emitLength)
      break
    }
    return visible
  }

  finish(): string {
    if (this.hiddenClose) {
      this.buffer = ''
      this.hiddenClose = null
      return ''
    }
    const openingPrefix = longestSuffixPrefix(this.buffer, [ACTION_OPEN, LEGACY_OPEN])
    const visible = openingPrefix ? this.buffer.slice(0, -openingPrefix) : this.buffer
    this.buffer = ''
    return visible
  }
}
