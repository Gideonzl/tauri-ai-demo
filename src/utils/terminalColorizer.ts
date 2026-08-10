/**
 * Terminal output colorizer — adds ANSI colors to plain-text patterns.
 * Applied as a transform on the SSH output stream before xterm rendering.
 *
 * Rules are sourced from useHighlightRulesStore — users can toggle built-in
 * rules and add custom ones via Settings. Hardcoded fallback if store not ready.
 */
import { useHighlightRulesStore, hexToAnsi } from '@/stores/highlightRules'

// ANSI color codes
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  // Foreground
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  // Bright/bold foreground (1;3Xm)
  brightRed: '\x1b[1;31m',
  brightGreen: '\x1b[1;32m',
  brightYellow: '\x1b[1;33m',
  brightBlue: '\x1b[1;34m',
  brightMagenta: '\x1b[1;35m',
  brightCyan: '\x1b[1;36m',
  brightWhite: '\x1b[1;37m',
}

/** ANSI regex — matches any ANSI/SGR escape sequence */
const ANSI_RE = /\x1b\[[0-9;]*m/g

/**
 * Safely wrap a match in ANSI codes, restoring any existing ANSI state.
 * Input text that already contains ANSI codes is NOT double-wrapped —
 * we only colorize the uncolored text segments.
 */
function wrap(text: string, color: string): string {
  return `${color}${text}${C.reset}`
}

/**
 * Apply color to regex matches, avoiding already-ANSI-colored regions.
 * Strategy: extract all ANSI codes, operate on plain text, re-insert codes.
 * For simplicity we use negative lookahead/lookbehind to skip text
 * immediately preceded by or followed by ANSI sequences.
 */
type ColorResolver = string | ((match: string) => string)

function colorizeRegion(text: string, pattern: RegExp, color: ColorResolver): string {
  // Split text into regions: plain and ANSI-colored
  const parts: { text: string; isAnsi: boolean }[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null

  ANSI_RE.lastIndex = 0
  while ((match = ANSI_RE.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: text.slice(lastIdx, match.index), isAnsi: false })
    }
    parts.push({ text: match[0], isAnsi: true })
    lastIdx = ANSI_RE.lastIndex
  }
  if (lastIdx < text.length) {
    parts.push({ text: text.slice(lastIdx), isAnsi: false })
  }

  // Only apply coloring to non-ANSI parts
  return parts.map(p => {
    if (p.isAnsi) return p.text
    // Apply pattern replacement only to this plain-text segment
    const newPattern = new RegExp(pattern.source, pattern.flags)
    return p.text.replace(newPattern, (m) => {
      // Conditional rules return their complete ANSI-wrapped match. Generic
      // rules only provide the color and are wrapped here.
      return typeof color === 'function' ? color(m) : wrap(m, color)
    })
  }).join('')
}

export function colorizeTerminalOutput(text: string): string {
  if (!text || text.length < 2) return text

  let result = text

  // Read rules from store (dynamic, user-configurable)
  let store: ReturnType<typeof useHighlightRulesStore> | null = null
  try { store = useHighlightRulesStore() } catch { /* store not ready */ }

  if (store) {
    // Apply all enabled rules from the store
    for (const rule of store.enabledRules) {
      try {
        const regex = new RegExp(rule.pattern, rule.id === 'comment' || rule.id === 'ini-section' || rule.id === 'json-key' ? 'gm' : 'gi')
        result = colorizeRegion(result, regex, hexToAnsi(rule.color))
      } catch { /* invalid regex — skip */ }
    }

    // Special handlers for rules with conditional coloring
    // (color depends on the matched content, not a single fixed color)
    // These are only applied if the corresponding rule is enabled

    const isEnabled = (id: string) => store!.rules.find(r => r.id === id)?.enabled ?? true

    // Boolean/state: green for positive, red for negative
    if (isEnabled('success')) {
      result = colorizeRegion(result, /\b(true|false|enabled|disabled|active|inactive|online|offline)\b/gi, (m: string) => {
        const low = m.toLowerCase()
        if (['true', 'enabled', 'active', 'online', 'on', 'yes'].includes(low)) return wrap(m, C.green)
        if (['false', 'disabled', 'inactive', 'offline', 'off', 'no'].includes(low)) return wrap(m, C.red)
        return m
      })
    }

    // Docker states: green for Up, red for Exited/Dead
    if (isEnabled('docker-state')) {
      result = colorizeRegion(result, /\b(Up\s+\d+\s+\w+|Exited\s*\(\d+\)|Restarting\s*\(\d+\)|Created|Paused|Removing|Dead)\b/g, (m: string) => {
        if (/^Up/.test(m)) return wrap(m, C.green)
        if (/^Exit|^Restart|^Dead/.test(m)) return wrap(m, C.red)
        return wrap(m, C.yellow)
      })
    }

    // Systemd states: green for active, red for failed/inactive
    if (isEnabled('systemd')) {
      result = colorizeRegion(result, /\b(active\s*\(running\)|active\s*\(exited\)|inactive\s*\(dead\)|failed\s*\(Result[^)]*\)|enabled|disabled|static|masked)\b/gi, (m: string) => {
        const low = m.toLowerCase()
        if (low.startsWith('active')) return wrap(m, C.green)
        if (low.startsWith('failed')) return wrap(m, C.red)
        if (low.startsWith('inactive') || low === 'disabled' || low === 'masked') return wrap(m, C.red)
        if (low === 'enabled' || low === 'static') return wrap(m, C.green)
        return m
      })
    }

    // HTTP status codes: green 2xx, cyan 3xx, yellow 4xx, red 5xx
    if (isEnabled('http-status')) {
      result = colorizeRegion(result, /\b(200|201|204|301|302|304|400|401|403|404|405|408|429|500|502|503|504)\b(?=\s|$)/g, (m: string) => {
        const code = parseInt(m)
        if (code < 300) return wrap(m, C.green)
        if (code < 400) return wrap(m, C.cyan)
        if (code < 500) return wrap(m, C.yellow)
        return wrap(m, C.red)
      })
    }

    // Bracket tags: blue for [12345], green for [OK], red for [FAIL]
    if (isEnabled('bracket-tag')) {
      result = colorizeRegion(result, /\[\s*(?:\d+|OK|ok|成功|FAIL|fail|WARN|warn|INFO|info)\s*\]/g, (m: string) => {
        if (/\d+/.test(m)) return wrap(m, C.blue)
        if (/ok|成功|info/i.test(m)) return wrap(m, C.green)
        if (/fail|warn/i.test(m)) return wrap(m, C.red)
        return m
      })
    }

    return result
  }

  // Fallback: store not available — apply basic builtins
  result = colorizeRegion(result, /\b\d{4}[-\/.]\d{2}[-\/.]\d{2}\b/g, C.brightCyan)
  result = colorizeRegion(result, /\b([01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\b/g, C.brightYellow)

  return result
}
