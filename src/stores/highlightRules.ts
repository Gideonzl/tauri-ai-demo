/**
 * Terminal output highlight rules — built-in + custom patterns with ANSI colors.
 * Persisted to localStorage. Built-in rules can be toggled but not deleted.
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface HighlightRule {
  id: string
  name: string           // Display name (e.g., "Time", "IP Address")
  pattern: string        // Regex pattern string
  color: string          // ANSI color code (e.g., "\x1b[1;33m")
  colorLabel: string     // Human-readable color name (e.g., "Yellow Bold")
  enabled: boolean
  isBuiltin: boolean
  description?: string
}

/** Convert hex color (#FFA500) to ANSI true-color escape sequence */
export function hexToAnsi(hex: string): string {
  if (!hex) return '\x1b[37m'
  if (hex.startsWith('\x1b')) return hex // already ANSI
  const h = hex.replace('#', '')
  if (h.length !== 6) return hex
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `\x1b[38;2;${r};${g};${b}m`
}

/** Convert ANSI code back to hex for color picker display */
export function ansiToHex(ansi: string): string {
  if (!ansi) return '#CCCCCC'
  // True color
  const tc = ansi.match(/\x1b\[38;2;(\d+);(\d+);(\d+)m/)
  if (tc) return '#' + [tc[1], tc[2], tc[3]].map(n => parseInt(n).toString(16).padStart(2, '0').toUpperCase()).join('')
  // Standard ANSI map
  const m: Record<string, string> = {
    '\x1b[31m':'#CC5555','\x1b[1;31m':'#FF6666','\x1b[32m':'#55CC55','\x1b[1;32m':'#66FF66',
    '\x1b[33m':'#CCCC55','\x1b[1;33m':'#FFFF66','\x1b[2;33m':'#888844','\x1b[34m':'#5555CC',
    '\x1b[1;34m':'#6666FF','\x1b[35m':'#CC55CC','\x1b[1;35m':'#FF66FF','\x1b[36m':'#55CCCC',
    '\x1b[1;36m':'#66FFFF','\x1b[2;36m':'#448888','\x1b[37m':'#CCCCCC','\x1b[1;37m':'#FFFFFF',
    '\x1b[2;37m':'#888888',
  }
  return m[ansi] || '#CCCCCC'
}

// Quick-pick color palette shown in the UI
export const COLOR_PRESETS = ['#FF6666','#66FF66','#FFFF66','#6666FF','#FF66FF','#66FFFF','#FFFFFF','#CC5555','#55CC55','#CCCC55','#5555CC','#CC55CC','#55CCCC','#CCCCCC','#FF9944','#44CCFF','#99FF44','#FF44CC','#888888']

const BUILTIN_RULES: Omit<HighlightRule, 'enabled'>[] = [
  { id: 'iso-date',      name: 'ISO Date',         pattern: '\\b\\d{4}[-/.]\\d{2}[-/.]\\d{2}\\b',                 color: '\x1b[1;36m',  colorLabel: 'Cyan Bold',   isBuiltin: true, description: '2026-06-17' },
  { id: 'time',          name: 'Time (HH:MM:SS)',  pattern: '\\b([01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\b',     color: '\x1b[1;33m',  colorLabel: 'Yellow Bold', isBuiltin: true, description: '02:11:36, 14:03' },
  { id: 'month-date',    name: 'Month Date',       pattern: '\\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\s+\\d{1,2}(?:\\s*,?\\s*\\d{4})?\\b', color: '\x1b[1;36m', colorLabel: 'Cyan Bold', isBuiltin: true, description: 'Jun 17 2026' },
  { id: 'weekday',       name: 'Weekday',          pattern: '\\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\\b',            color: '\x1b[2;36m',  colorLabel: 'Dim Cyan',    isBuiltin: true, description: 'Wednesday' },
  { id: 'ipv4',          name: 'IPv4 Address',     pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: '192.168.1.1' },
  { id: 'ip-port',       name: 'IP:Port',          pattern: '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?):\\d{1,5}\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: '0.0.0.0:8080' },
  { id: 'file-path',     name: 'File Path',        pattern: '(?:~\\/[a-zA-Z0-9._\\-\\/]+|\\/[a-zA-Z0-9._\\-\\/]*[a-zA-Z0-9._-])\\/?', color: '\x1b[1;34m', colorLabel: 'Blue Bold', isBuiltin: true, description: '/etc/nginx/nginx.conf' },
  { id: 'url',           name: 'URL',              pattern: '\\bhttps?:\\/\\/[^\\s\\x1b]+',                          color: '\x1b[36m',    colorLabel: 'Cyan',      isBuiltin: true, description: 'https://example.com' },
  { id: 'num-unit',      name: 'Number + Unit',    pattern: '\\b\\d+\\.?\\d*\\s*(?:B|KB|MB|GB|TB|PB|KiB?|MiB?|GiB?|TiB?|PiB?)\\b', color: '\x1b[1;35m', colorLabel: 'Magenta Bold', isBuiltin: true, description: '50G, 7.8Gi' },
  { id: 'percent',       name: 'Percentage',       pattern: '\\b\\d{1,3}(?:\\.\\d+)?%\\b',                            color: '\x1b[1;35m',  colorLabel: 'Magenta Bold', isBuiltin: true, description: '25%, 99.5%' },
  { id: 'large-num',     name: 'Large Number',     pattern: '\\b\\d{4,}(?:\\.\\d+)?\\b',                               color: '\x1b[35m',    colorLabel: 'Magenta',   isBuiltin: true, description: '12345, 65535' },
  { id: 'cpu-mem',       name: 'CPU/Mem Value',    pattern: '\\b\\d+\\.\\d+\\s*(?:Gi|Mi|Ki|G|M|K)\\b',                 color: '\x1b[1;35m',  colorLabel: 'Magenta Bold', isBuiltin: true, description: '2.1Gi, 3.9G' },
  { id: 'error',         name: 'Error Keywords',   pattern: '\\b(ERROR|FAIL(?:ED|URE)?|CRITICAL|FATAL|PANIC)\\b',     color: '\x1b[1;31m',  colorLabel: 'Red Bold',   isBuiltin: true, description: 'ERROR, FAILED' },
  { id: 'warning',       name: 'Warning Keywords', pattern: '\\b(WARN(?:ING)?)\\b',                                    color: '\x1b[1;33m',  colorLabel: 'Yellow Bold', isBuiltin: true, description: 'WARN, WARNING' },
  { id: 'success',       name: 'Success Keywords', pattern: '\\b(OK|SUCCESS|DONE|COMPLETED|READY|ACTIVE|RUNNING|UP)\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: 'OK, SUCCESS' },
  { id: 'net-state',     name: 'Network State',    pattern: '\\b(LISTEN|ESTABLISHED|TIME_WAIT|CLOSE_WAIT|SYN_SENT|SYN_RECV|FIN_WAIT|CLOSED)\\b', color: '\x1b[32m', colorLabel: 'Green', isBuiltin: true, description: 'LISTEN' },
  { id: 'uid-gid',       name: 'UID:GID',          pattern: '\\b(?:root:\\d+|\\d+:root|root:root)\\b',                  color: '\x1b[2;37m',  colorLabel: 'Dim White',  isBuiltin: true, description: 'root:root' },
  { id: 'email',         name: 'Email',            pattern: '\\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\b',    color: '\x1b[36m',    colorLabel: 'Cyan',      isBuiltin: true, description: 'admin@example.com' },
  { id: 'hex-num',       name: 'Hex Number',       pattern: '\\b0x[0-9a-fA-F]{2,}\\b',                                 color: '\x1b[35m',    colorLabel: 'Magenta',   isBuiltin: true, description: '0xDEADBEEF' },
  { id: 'bracket-tag',   name: 'Bracket Tag',      pattern: '\\[\\s*(?:\\d+|OK|ok|成功|FAIL|fail|WARN|warn|INFO|info)\\s*\\]', color: '\x1b[34m', colorLabel: 'Blue', isBuiltin: true, description: '[12345], [OK]' },
  { id: 'docker-id',     name: 'Docker Container', pattern: '\\b[a-f0-9]{12}\\b',                                      color: '\x1b[36m',    colorLabel: 'Cyan',      isBuiltin: true, description: 'a1b2c3d4e5f6' },
  { id: 'uuid',          name: 'UUID',             pattern: '\\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\b', color: '\x1b[36m', colorLabel: 'Cyan', isBuiltin: true, description: '550e8400-e29b-...' },
  { id: 'mac',           name: 'MAC Address',      pattern: '\\b(?:[a-f0-9]{2}[:-]){5}[a-f0-9]{2}\\b',                 color: '\x1b[35m',    colorLabel: 'Magenta',   isBuiltin: true, description: 'aa:bb:cc:dd:ee:ff' },
  { id: 'permission',    name: 'Permissions',      pattern: '\\b[d\\-l](?:[r\\-][w\\-][x\\-]){3}[\\.\\+@]?\\b',          color: '\x1b[2;33m',  colorLabel: 'Dim Yellow', isBuiltin: true, description: 'drwxr-xr-x' },
  { id: 'docker-state',  name: 'Docker State',     pattern: '\\b(Up\\s+\\d+\\s+\\w+|Exited\\s*\\(\\d+\\)|Restarting\\s*\\(\\d+\\)|Created|Paused|Removing|Dead)\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: 'Up 2d, Exited (1)' },
  { id: 'systemd',       name: 'systemd State',    pattern: '\\b(active\\s*\\(running\\)|active\\s*\\(exited\\)|inactive\\s*\\(dead\\)|failed\\s*\\(Result[^)]*\\))\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: 'active (running)' },
  { id: 'http-status',   name: 'HTTP Status',      pattern: '\\b(200|201|204|301|302|304|400|401|403|404|405|408|429|500|502|503|504)\\b(?=\\s|$)', color: '\x1b[1;33m', colorLabel: 'Yellow Bold', isBuiltin: true, description: '200, 404, 500' },
  { id: 'signal',        name: 'Signal',           pattern: '\\bSIG[A-Z]{2,}\\b',                                      color: '\x1b[1;31m',  colorLabel: 'Red Bold',   isBuiltin: true, description: 'SIGTERM, SIGKILL' },
  { id: 'version',       name: 'Version Number',   pattern: '\\bv?\\d+\\.\\d+(?:\\.\\d+)*(?:-[a-zA-Z0-9]+)?\\b',        color: '\x1b[36m',    colorLabel: 'Cyan',      isBuiltin: true, description: 'v1.2.3, nginx/1.18' },
  { id: 'docker-image',  name: 'Docker Image',     pattern: '\\b[a-zA-Z0-9._-]*[a-zA-Z][a-zA-Z0-9._-]*:[a-zA-Z0-9._-]+\\b', color: '\x1b[1;35m', colorLabel: 'Magenta Bold', isBuiltin: true, description: 'nginx:latest' },
  { id: 'hostname',      name: 'Hostname',         pattern: '\\b[a-zA-Z][a-zA-Z0-9-]*\\.[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\b', color: '\x1b[1;32m', colorLabel: 'Green Bold', isBuiltin: true, description: 'web.example.com' },
  { id: 'temp-speed',    name: 'Temp/Speed',       pattern: '\\b\\d+(?:\\.\\d+)?\\s*(?:°[CF]|MB\\/s|GB\\/s|Mbps|Gbps|rpm|Mhz|Ghz)\\b', color: '\x1b[1;35m', colorLabel: 'Magenta Bold', isBuiltin: true, description: '45°C, 100MB/s' },
  { id: 'env-var',       name: 'Env Variable',     pattern: '\\$\\{?[A-Z_][A-Z0-9_]*\\}?\\b',                           color: '\x1b[1;34m',  colorLabel: 'Blue Bold',  isBuiltin: true, description: '$HOME, ${PATH}' },
  { id: 'comment',       name: 'Comment Line',     pattern: '^(\\s*#[^\\n]*)$',                                         color: '\x1b[2;37m',  colorLabel: 'Dim White',  isBuiltin: true, description: '# comment' },
  { id: 'json-key',      name: 'JSON Key',         pattern: '"([a-zA-Z_][a-zA-Z0-9_]*)":',                               color: '\x1b[1;36m',  colorLabel: 'Cyan Bold',  isBuiltin: true, description: '"name":' },
  { id: 'ini-section',   name: 'INI Section',      pattern: '^\\[[a-zA-Z0-9._-]+\\]$',                                   color: '\x1b[1;33m',  colorLabel: 'Yellow Bold', isBuiltin: true, description: '[database]' },
]

const STORAGE_KEY = 'highlight-rules'

export const useHighlightRulesStore = defineStore('highlightRules', () => {
  const rules = ref<HighlightRule[]>([])
  const customRules = ref<HighlightRule[]>([])

  const enabledRules = computed(() => rules.value.filter(r => r.enabled))

  function init() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const saved = JSON.parse(raw) as { builtin: Record<string, boolean>; custom: HighlightRule[] }
        // Restore built-in rules with saved enabled states
        rules.value = BUILTIN_RULES.map(r => ({
          ...r,
          enabled: saved.builtin?.[r.id] ?? true,
        }))
        // Restore custom rules
        customRules.value = saved.custom || []
        rules.value = [...rules.value, ...customRules.value]
        return
      }
    } catch { /* first run */ }

    // First run — all builtins enabled
    rules.value = BUILTIN_RULES.map(r => ({ ...r, enabled: true }))
    customRules.value = []
  }

  function toggleRule(id: string) {
    const r = rules.value.find(r => r.id === id)
    if (r) r.enabled = !r.enabled
    saveToStorage()
  }

  function enableAll() {
    rules.value.forEach(r => r.enabled = true)
    saveToStorage()
  }

  function disableAll() {
    rules.value.forEach(r => r.enabled = false)
    saveToStorage()
  }

  function addCustomRule(name: string, pattern: string, color: string, colorLabel: string) {
    const id = `custom-${Date.now()}`
    const rule: HighlightRule = {
      id, name, pattern, color, colorLabel,
      enabled: true, isBuiltin: false,
      description: pattern,
    }
    customRules.value.push(rule)
    rules.value.push(rule)
    saveToStorage()
    return rule
  }

  function updateRule(id: string, updates: Partial<Pick<HighlightRule, 'name' | 'pattern' | 'color' | 'colorLabel' | 'enabled'>>) {
    const r = rules.value.find(r => r.id === id)
    if (r) {
      Object.assign(r, updates)
      if (!r.isBuiltin) {
        const ci = customRules.value.findIndex(c => c.id === id)
        if (ci !== -1) Object.assign(customRules.value[ci], updates)
      }
      saveToStorage()
    }
  }

  function deleteCustomRule(id: string) {
    customRules.value = customRules.value.filter(r => r.id !== id)
    rules.value = rules.value.filter(r => r.id !== id)
    saveToStorage()
  }

  function resetToDefaults() {
    customRules.value = []
    rules.value = BUILTIN_RULES.map(r => ({ ...r, enabled: true }))
    saveToStorage()
  }

  function saveToStorage() {
    try {
      const builtin: Record<string, boolean> = {}
      rules.value.filter(r => r.isBuiltin).forEach(r => { builtin[r.id] = r.enabled })
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        builtin,
        custom: customRules.value,
      }))
    } catch { /* ignore */ }
  }

  init()

  return {
    rules, enabledRules, customRules, COLOR_PRESETS,
    toggleRule, enableAll, disableAll,
    addCustomRule, updateRule, deleteCustomRule,
    resetToDefaults, init, saveRules: saveToStorage,
  }
})
