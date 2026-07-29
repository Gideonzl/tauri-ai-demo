/**
 * Theme System — CSS Custom Properties bridge
 *
 * Emits ~60 CSS custom properties to document.documentElement,
 * enabling runtime theme switching (4 presets + custom).
 *
 * Architecture:
 *   theme.ts (palettes + applyTheme)  ←  config.ts (scheme state)
 *        ↓
 *   CSS custom properties on :root    ←  consumed by SCSS via var(--token, fallback)
 */

import type { ColorScheme, ThemeColors } from '@/stores/config'

// ============================================================
// Color utility helpers
// ============================================================

/** Parse hex color to {r,g,b} */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null
}

/** Convert {r,g,b} back to #rrggbb */
function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')
}

/** Linear interpolate between two hex colors (t: 0→a, 1→b) */
function lerpColor(a: string, b: string, t: number): string {
  const ca = hexToRgb(a), cb = hexToRgb(b)
  if (!ca || !cb) return a
  return rgbToHex(
    ca.r + (cb.r - ca.r) * t,
    ca.g + (cb.g - ca.g) * t,
    ca.b + (cb.b - ca.b) * t,
  )
}

/** Lighten a hex color by blending with white */
function lighten(hex: string, amount: number): string {
  return lerpColor(hex, '#ffffff', amount)
}

/** Darken a hex color by blending with black */
function darken(hex: string, amount: number): string {
  return lerpColor(hex, '#000000', amount)
}

/** Create rgba() string from hex */
function rgba(hex: string, alpha: number): string {
  const c = hexToRgb(hex)
  if (!c) return `rgba(0,0,0,${alpha})`
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}

/** Pick the more legible foreground for a solid color (WCAG relative luminance). */
function readableForeground(background: string): '#07111f' | '#ffffff' {
  const c = hexToRgb(background)
  if (!c) return '#ffffff'
  const linear = [c.r, c.g, c.b]
    .map(value => value / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)))
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  const darkContrast = (luminance + 0.05) / 0.055
  const lightContrast = 1.05 / (luminance + 0.05)
  return darkContrast >= lightContrast ? '#07111f' : '#ffffff'
}

/** Treat custom palettes with a bright base background as light UI shells. */
function isLightBackground(hex: string): boolean {
  const c = hexToRgb(hex)
  if (!c) return false
  const [r, g, b] = [c.r, c.g, c.b].map(value => value / 255)
  const linear = [r, g, b].map(value => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)))
  const luminance = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  return luminance > 0.34
}

// ============================================================
// Semantic colors (consistent across themes)
// ============================================================

const SEMANTIC: Record<string, string> = {
  '--color-success': '#4caf7d',
  '--color-warning': '#d4a24e',
  '--color-danger': '#d45454',
  '--color-info': '#7a8a9e',
  '--color-bg-success-hover': 'rgba(76, 175, 125, 0.12)',
  '--color-bg-warning-hover': 'rgba(212, 162, 78, 0.12)',
  '--color-bg-danger-hover': 'rgba(212, 84, 84, 0.12)',
}

// ============================================================
// Chart / monitor colors
// ============================================================

const CHART: Record<string, string> = {
  '--chart-cpu-normal': '#5b9bd5',
  '--chart-cpu-warning': '#e69138',
  '--chart-cpu-danger': '#e05555',
  '--chart-disk-read': '#5b9bd5',
  '--chart-disk-write': '#e05555',
  '--chart-net-rx': '#4caf7d',
  '--chart-net-tx': '#e69138',
}

// ============================================================
// Non-color tokens (identical across themes)
// ============================================================

const BASE_TOKENS: Record<string, string> = {
  '--sidebar-width': '56px',
  '--ai-panel-width': '320px',
  '--ai-panel-collapsed': '40px',
  '--workspace-min-width': '200px',
  '--header-height': '40px',
  '--status-bar-height': '24px',

  '--border-radius-sm': '3px',
  '--border-radius-md': '6px',
  '--border-radius-lg': '8px',

  '--shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.3)',
  '--shadow-md': '0 2px 6px rgba(0, 0, 0, 0.4)',
  '--shadow-lg': '0 4px 12px rgba(0, 0, 0, 0.5)',

  '--transition-fast': '0.12s ease',
  '--transition-normal': '0.25s ease',
  '--transition-slow': '0.3s ease',

  '--font-family': "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  '--font-family-mono': "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', 'Consolas', monospace",

  '--font-size-xs': '11px',
  '--font-size-sm': '12px',
  '--font-size-md': '13px',
  '--font-size-lg': '14px',
  '--font-size-xl': '17px',
  '--font-size-xxl': '20px',

  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '12px',
  '--spacing-lg': '16px',
  '--spacing-xl': '24px',
}

// ============================================================
// Full palette builder
// ============================================================

interface ThemeDef {
  primary: string
  bg: string
  surface: string
  text: string
  textSecondary: string
  isLight?: boolean
  syntax: {
    keyword: string; string_: string; number: string; comment: string
    key: string; section: string; error: string; warning: string
    info: string; variable: string
  }
}

const THEME_DEFS: Record<string, ThemeDef> = {
  'tech': {
    primary: '#3b82f6',
    bg: '#0a0e17',
    surface: '#141b2b',
    text: '#e6edf7',
    textSecondary: '#8b99b4',
    syntax: {
      keyword: '#60a5fa', string_: '#4ade80', number: '#fbbf24', comment: '#5a6785',
      key: '#38bdf8', section: '#a78bfa', error: '#f87171', warning: '#fbbf24',
      info: '#38bdf8', variable: '#f472b6',
    },
  },
  'termius-dark': {
    primary: '#6b9dff',
    bg: '#0d0d1a',
    surface: '#1e1e38',
    text: '#f0f0ff',
    textSecondary: '#a0a0cc',
    syntax: {
      keyword: '#c792ea', string_: '#c3e88d', number: '#f78c6c', comment: '#546e7a',
      key: '#89ddff', section: '#ffcb6b', error: '#ff5370', warning: '#ffcb6b',
      info: '#82aaff', variable: '#f07178',
    },
  },
  'neon-ops': {
    primary: '#22f7ff',
    bg: '#070912',
    surface: '#10172d',
    text: '#f4fbff',
    textSecondary: '#8ea8c8',
    syntax: {
      keyword: '#a855ff', string_: '#42f58d', number: '#ffcc66', comment: '#52627c',
      key: '#22f7ff', section: '#ff4fd8', error: '#ff4d6d', warning: '#ffcc66',
      info: '#22f7ff', variable: '#ff4fd8',
    },
  },
  'xterminal': {
    primary: '#8ab4ff',
    bg: '#1a1b26',
    surface: '#292e42',
    text: '#cfd6ff',
    textSecondary: '#6b7db0',
    syntax: {
      keyword: '#bb9af7', string_: '#9ece6a', number: '#ff9e64', comment: '#565f89',
      key: '#7dcfff', section: '#e0af68', error: '#f7768e', warning: '#e0af68',
      info: '#7aa2f7', variable: '#bb9af7',
    },
  },
  'monokai': {
    primary: '#66d9ef',
    bg: '#272822',
    surface: '#3d3d30',
    text: '#f8f8f2',
    textSecondary: '#8a8574',
    syntax: {
      keyword: '#f92672', string_: '#e6db74', number: '#ae81ff', comment: '#75715e',
      key: '#66d9ef', section: '#e6db74', error: '#f92672', warning: '#e6db74',
      info: '#66d9ef', variable: '#f92672',
    },
  },
  'one-dark': {
    primary: '#61afef',
    bg: '#282c34',
    surface: '#333842',
    text: '#c8ccd4',
    textSecondary: '#6d7484',
    syntax: {
      keyword: '#c678dd', string_: '#98c379', number: '#d19a66', comment: '#5c6370',
      key: '#61afef', section: '#e5c07b', error: '#e06c75', warning: '#e5c07b',
      info: '#61afef', variable: '#e06c75',
    },
  },

  // ═══ New high-contrast themes ═══

  'dracula': {
    primary: '#caa0ff',
    bg: '#282a36',
    surface: '#3d4058',
    text: '#f8f8f2',
    textSecondary: '#7b8bc0',
    syntax: {
      keyword: '#ff79c6', string_: '#50fa7b', number: '#bd93f9', comment: '#6272a4',
      key: '#8be9fd', section: '#f1fa8c', error: '#ff5555', warning: '#f1fa8c',
      info: '#8be9fd', variable: '#ffb86c',
    },
  },

  'nord': {
    primary: '#8fcee0',
    bg: '#2e3440',
    surface: '#434c5e',
    text: '#eceff4',
    textSecondary: '#8ebcd8',
    syntax: {
      keyword: '#81a1c1', string_: '#a3be8c', number: '#b48ead', comment: '#4c566a',
      key: '#88c0d0', section: '#ebcb8b', error: '#bf616a', warning: '#d08770',
      info: '#5e81ac', variable: '#d08770',
    },
  },

  'high-contrast': {
    primary: '#4da6ff',
    bg: '#000000',
    surface: '#1a1a1a',
    text: '#ffffff',
    textSecondary: '#cccccc',
    syntax: {
      keyword: '#569cd6', string_: '#ce9178', number: '#b5cea8', comment: '#6a9955',
      key: '#9cdcfe', section: '#dcdcaa', error: '#f44747', warning: '#cca700',
      info: '#4ec9b0', variable: '#9cdcfe',
    },
  },

  'catppuccin': {
    primary: '#d4b0ff',
    bg: '#1e1e2e',
    surface: '#3b3d58',
    text: '#d9e0ee',
    textSecondary: '#878a9e',
    syntax: {
      keyword: '#cba6f7', string_: '#a6e3a1', number: '#fab387', comment: '#6c7086',
      key: '#89b4fa', section: '#f9e2af', error: '#f38ba8', warning: '#f9e2af',
      info: '#89dceb', variable: '#f38ba8',
    },
  },

  'gruvbox-dark': {
    primary: '#8ec07c',
    bg: '#282828',
    surface: '#3c3836',
    text: '#fbf1c7',
    textSecondary: '#bdae93',
    syntax: {
      keyword: '#d3869b', string_: '#b8bb26', number: '#fe8019', comment: '#928374',
      key: '#83a598', section: '#fabd2f', error: '#fb4934', warning: '#fabd2f',
      info: '#8ec07c', variable: '#fb4934',
    },
  },

  // ═══ Light / bright themes ═══

  'one-light': {
    primary: '#4078f2',
    bg: '#fafbfc',
    surface: '#e8ecf0',
    text: '#383a42',
    textSecondary: '#696c77',
    isLight: true,
    syntax: {
      keyword: '#a626a4', string_: '#50a14f', number: '#986801', comment: '#a0a1a7',
      key: '#4078f2', section: '#c18401', error: '#e45649', warning: '#c18401',
      info: '#0184bc', variable: '#e45649',
    },
  },

  'github-light': {
    primary: '#0969da',
    bg: '#ffffff',
    surface: '#f0f2f5',
    text: '#1f2328',
    textSecondary: '#656d76',
    isLight: true,
    syntax: {
      keyword: '#cf222e', string_: '#0a3069', number: '#0550ae', comment: '#6e7781',
      key: '#8250df', section: '#953800', error: '#cf222e', warning: '#9a6700',
      info: '#0969da', variable: '#953800',
    },
  },

  'solarized-light': {
    primary: '#268bd2',
    bg: '#fdf6e3',
    surface: '#eee8d5',
    text: '#586e75',
    textSecondary: '#839496',
    isLight: true,
    syntax: {
      keyword: '#cb4b16', string_: '#859900', number: '#2aa198', comment: '#93a1a1',
      key: '#268bd2', section: '#b58900', error: '#dc322f', warning: '#b58900',
      info: '#6c71c4', variable: '#dc322f',
    },
  },

  'min-light': {
    primary: '#0066cc',
    bg: '#ffffff',
    surface: '#f5f5f5',
    text: '#1a1a1a',
    textSecondary: '#4a4a4a',
    isLight: true,
    syntax: {
      keyword: '#8b00c9', string_: '#007b00', number: '#b35c00', comment: '#888888',
      key: '#0066cc', section: '#b35c00', error: '#cc0000', warning: '#b35c00',
      info: '#0077aa', variable: '#cc0000',
    },
  },
}

function buildPalette(def: ThemeDef): Record<string, string> {
  const { primary, bg, surface, text, textSecondary, isLight } = def
  const blendTarget = isLight ? '#ffffff' : '#000000'
  const shift = (hex: string, amt: number) => lerpColor(hex, blendTarget, amt)
  const primaryForeground = readableForeground(primary)

  // Derive background hierarchy from bg→surface
  const bgApp = bg
  const bgPrimary = lerpColor(bg, surface, 0.3)
  const bgSidebar = surface
  const bgSurface = surface
  const bgToolbar = isLight ? lerpColor(surface, '#000000', 0.02) : lerpColor(surface, '#ffffff', 0.03)
  const bgPanel = lerpColor(bg, surface, 0.15)
  const bgInput = isLight ? lerpColor(surface, '#000000', 0.03) : lerpColor(surface, '#ffffff', 0.03)

  // Derive text hierarchy from text→textSecondary
  const textPrimary = text
  const textRegular = isLight ? lerpColor(text, '#ffffff', 0.1) : lerpColor(text, bg, 0.15)
  const textSec = textSecondary
  const textPlaceholder = isLight ? lerpColor(textSecondary, '#ffffff', 0.2) : lerpColor(textSecondary, bg, 0.3)
  const textMuted = isLight ? lerpColor(textSecondary, '#ffffff', 0.4) : lerpColor(textSecondary, bg, 0.5)

  // Derive border
  const border = isLight ? rgba('#000000', 0.1) : rgba(text, 0.08)
  const borderLight = isLight ? rgba('#000000', 0.06) : rgba(text, 0.05)
  const borderFocus = primary

  // ── Modern aesthetic: glass / glow / gradient / elevation ──
  const glassBg = isLight ? rgba('#ffffff', 0.72) : rgba(surface, 0.55)
  const glassBorder = isLight ? rgba('#000000', 0.08) : rgba('#ffffff', 0.10)
  const glowPrimary = `0 0 16px ${rgba(primary, isLight ? 0.22 : 0.38)}`
  const glowSoft = `0 0 10px ${rgba(primary, 0.18)}`
  const neonCyan = primary
  const neonViolet = def.syntax.keyword
  const neonPink = def.syntax.variable
  // Keep the gradient on the same side of the luminance scale as its text.
  // A lightened blue would otherwise make white text fail contrast on its end.
  const gradPrimary = primaryForeground === '#ffffff'
    ? `linear-gradient(135deg, ${primary}, ${darken(primary, 0.1)})`
    : `linear-gradient(135deg, ${primary}, ${lighten(primary, 0.18)})`
  const gradApp = isLight
    ? `linear-gradient(160deg, ${bg}, ${lerpColor(bg, primary, 0.05)})`
    : `linear-gradient(160deg, ${lerpColor(bg, primary, 0.04)}, ${bg} 55%, ${lerpColor(bg, surface, 0.5)})`
  const gradSurface = `linear-gradient(180deg, ${lighten(surface, 0.03)}, ${surface})`
  const elev1 = isLight ? '0 1px 3px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.45)'
  const elev2 = isLight ? '0 4px 14px rgba(0,0,0,0.10)' : '0 4px 16px rgba(0,0,0,0.5)'
  const elev3 = isLight ? '0 10px 30px rgba(0,0,0,0.14)' : '0 12px 34px rgba(0,0,0,0.6)'
  const shellTopbar = isLight ? rgba('#ffffff', 0.9) : rgba(bg, 0.9)
  const shellSidebar = isLight ? rgba('#ffffff', 0.88) : rgba(bg, 0.94)
  const shellAi = isLight ? rgba(surface, 0.92) : rgba(bg, 0.96)
  const shellWorkspace = isLight ? rgba(bg, 0.76) : rgba(bg, 0.58)
  const shellScrim = isLight
    ? 'linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.12))'
    : 'linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.30))'
  const shellRail = `linear-gradient(180deg, transparent, ${rgba(primary, isLight ? 0.52 : 0.7)}, ${rgba(neonViolet, isLight ? 0.38 : 0.6)}, transparent)`

  return {
    '--color-primary': primary,
    '--color-primary-light': lighten(primary, 0.12),
    '--color-primary-dark': darken(primary, 0.1),
    '--color-on-primary': primaryForeground,

    '--color-text-primary': textPrimary,
    '--color-text-regular': textRegular,
    '--color-text-secondary': textSec,
    '--color-text-placeholder': textPlaceholder,
    '--color-text-muted': textMuted,

    '--color-bg-app': bgApp,
    '--color-bg-primary': bgPrimary,
    '--color-bg-sidebar': bgSidebar,
    '--color-bg-surface': bgSurface,
    '--color-bg-toolbar': bgToolbar,
    '--color-bg-panel': bgPanel,
    '--color-bg-input': bgInput,

    '--color-bg-hover': isLight ? rgba(primary, 0.1) : rgba(primary, 0.08),
    '--color-bg-active': isLight ? rgba(primary, 0.16) : rgba(primary, 0.14),
    '--color-bg-primary-hover': isLight ? rgba(primary, 0.14) : rgba(primary, 0.12),

    '--color-bg-message-user': isLight ? lerpColor(bg, '#000000', 0.03) : lerpColor(bg, '#ffffff', 0.04),
    '--color-bg-message-ai': bg,

    '--color-border': border,
    '--color-border-light': borderLight,
    '--color-border-focus': borderFocus,

    // Modern aesthetic tokens
    '--glass-bg': glassBg,
    '--glass-border': glassBorder,
    '--glow-primary': glowPrimary,
    '--glow-soft': glowSoft,
    '--neon-cyan': neonCyan,
    '--neon-violet': neonViolet,
    '--neon-pink': neonPink,
    '--surface-contrast': isLight ? 'rgba(255,255,255,0.92)' : 'rgba(5,8,18,0.88)',
    '--surface-contrast-soft': isLight ? 'rgba(255,255,255,0.82)' : 'rgba(9,14,30,0.76)',
    '--text-shadow-strong': isLight ? 'none' : '0 1px 2px rgba(0,0,0,0.86)',
    '--shell-topbar-bg': shellTopbar,
    '--shell-sidebar-bg': shellSidebar,
    '--shell-ai-bg': shellAi,
    '--shell-workspace-bg': shellWorkspace,
    '--shell-scrim': shellScrim,
    '--shell-aurora-primary': rgba(primary, isLight ? 0.10 : 0.24),
    '--shell-aurora-secondary': rgba(neonViolet, isLight ? 0.08 : 0.22),
    '--shell-nav-rail': shellRail,
    '--glow-cyan': `0 0 22px ${rgba(neonCyan, isLight ? 0.2 : 0.42)}`,
    '--glow-violet': `0 0 26px ${rgba(neonViolet, isLight ? 0.18 : 0.36)}`,
    '--glow-danger': `0 0 22px ${rgba(def.syntax.error, isLight ? 0.18 : 0.34)}`,
    '--gradient-primary': gradPrimary,
    '--gradient-app': gradApp,
    '--gradient-surface': gradSurface,
    '--elevation-1': elev1,
    '--elevation-2': elev2,
    '--elevation-3': elev3,

    // Syntax highlighting colors
    '--syntax-keyword': def.syntax.keyword,
    '--syntax-string': def.syntax.string_,
    '--syntax-number': def.syntax.number,
    '--syntax-comment': def.syntax.comment,
    '--syntax-key': def.syntax.key,
    '--syntax-section': def.syntax.section,
    '--syntax-error': def.syntax.error,
    '--syntax-warning': def.syntax.warning,
    '--syntax-info': def.syntax.info,
    '--syntax-variable': def.syntax.variable,

    // Terminal (xterm.js) theme
    '--terminal-bg': bgApp,
    '--terminal-fg': textPrimary,
    '--terminal-cursor': primary,
    '--shadow-sm': isLight ? '0 1px 2px rgba(0,0,0,0.08)' : '0 1px 2px rgba(0,0,0,0.3)',
    '--shadow-md': isLight ? '0 2px 6px rgba(0,0,0,0.1)' : '0 2px 6px rgba(0,0,0,0.4)',
    '--shadow-lg': isLight ? '0 4px 12px rgba(0,0,0,0.12)' : '0 4px 12px rgba(0,0,0,0.5)',

    '--terminal-black': isLight ? lighten(bgApp, 0.06) : darken(bgApp, 0.04),
    '--terminal-red': def.syntax.error,
    '--terminal-green': def.syntax.string_,
    '--terminal-yellow': def.syntax.warning,
    '--terminal-blue': def.syntax.info,
    '--terminal-magenta': def.syntax.keyword,
    '--terminal-cyan': def.syntax.key,
    '--terminal-white': textPrimary,
    '--terminal-bright-black': textMuted,
    '--terminal-bright-red': def.syntax.error,
    '--terminal-bright-green': def.syntax.string_,
    '--terminal-bright-yellow': def.syntax.warning,
    '--terminal-bright-blue': def.syntax.info,
    '--terminal-bright-magenta': def.syntax.keyword,
    '--terminal-bright-cyan': def.syntax.key,
    '--terminal-bright-white': '#ffffff',
  }
}

// ============================================================
// Pre-built palettes for each scheme
// ============================================================

const PALETTES: Record<string, Record<string, string>> = {}
for (const [name, def] of Object.entries(THEME_DEFS)) {
  PALETTES[name] = {
    ...buildPalette(def),
    ...SEMANTIC,
    ...CHART,
    ...BASE_TOKENS,
  }
}

// ============================================================
// applyTheme — main entry point
// ============================================================

/**
 * Apply theme CSS custom properties to document.documentElement.
 * Call once on app init (before mount) and on every theme change.
 */
export function applyTheme(scheme: ColorScheme, customColors?: ThemeColors): void {
  const root = document.documentElement

  let tokens: Record<string, string>

  if (scheme === 'custom' && customColors) {
    // Build custom palettes through the same pipeline as presets. This keeps a
    // user-selected light palette light across the whole shell, instead of
    // leaking the previous dark fallback into the navigation or AI panel.
    const customDef: ThemeDef = {
      primary: customColors.key || customColors.info,
      bg: customColors.bg,
      surface: customColors.surface,
      text: customColors.text,
      textSecondary: customColors.textSecondary,
      isLight: isLightBackground(customColors.bg),
      syntax: {
        keyword: customColors.keyword,
        string_: customColors.string,
        number: customColors.number,
        comment: customColors.comment,
        key: customColors.key,
        section: customColors.section,
        error: customColors.error,
        warning: customColors.warning,
        info: customColors.info,
        variable: customColors.variable,
      },
    }
    tokens = {
      ...buildPalette(customDef),
      ...SEMANTIC,
      ...CHART,
      ...BASE_TOKENS,
      '--terminal-bg': customColors.terminalBg || customColors.bg,
      '--terminal-fg': customColors.terminalFg || customColors.text,
      '--terminal-cursor': customColors.terminalCursor || customColors.key,
    }
  } else {
    tokens = PALETTES[scheme] || PALETTES['termius-dark']
  }

  // Apply all tokens
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value)
  }

  // Mark scheme on html element for optional attribute selectors
  root.setAttribute('data-theme', scheme)
}

/**
 * Get the current theme's full palette as a flat key-value object.
 * Useful for reading specific token values in JS (e.g., xterm theme).
 */
export function getCurrentPalette(): Record<string, string> {
  const root = document.documentElement
  const tokens: Record<string, string> = {}
  const allKeys = Object.keys({ ...PALETTES['termius-dark'] })
  for (const key of allKeys) {
    tokens[key] = root.style.getPropertyValue(key) || ''
  }
  return tokens
}
