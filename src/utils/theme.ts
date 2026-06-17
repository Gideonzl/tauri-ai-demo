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
  syntax: {
    keyword: string; string_: string; number: string; comment: string
    key: string; section: string; error: string; warning: string
    info: string; variable: string
  }
}

const THEME_DEFS: Record<string, ThemeDef> = {
  'termius-dark': {
    primary: '#5b8def',
    bg: '#0d0d1a',
    surface: '#16162a',
    text: '#e8e8f0',
    textSecondary: '#8888a0',
    syntax: {
      keyword: '#c792ea', string_: '#c3e88d', number: '#f78c6c', comment: '#546e7a',
      key: '#89ddff', section: '#ffcb6b', error: '#ff5370', warning: '#ffcb6b',
      info: '#82aaff', variable: '#f07178',
    },
  },
  'xterminal': {
    primary: '#7aa2f7',
    bg: '#1a1b26',
    surface: '#24283b',
    text: '#c0caf5',
    textSecondary: '#565f89',
    syntax: {
      keyword: '#bb9af7', string_: '#9ece6a', number: '#ff9e64', comment: '#565f89',
      key: '#7dcfff', section: '#e0af68', error: '#f7768e', warning: '#e0af68',
      info: '#7aa2f7', variable: '#bb9af7',
    },
  },
  'monokai': {
    primary: '#66d9ef',
    bg: '#272822',
    surface: '#383830',
    text: '#f8f8f2',
    textSecondary: '#75715e',
    syntax: {
      keyword: '#f92672', string_: '#e6db74', number: '#ae81ff', comment: '#75715e',
      key: '#66d9ef', section: '#e6db74', error: '#f92672', warning: '#e6db74',
      info: '#66d9ef', variable: '#f92672',
    },
  },
  'one-dark': {
    primary: '#61afef',
    bg: '#282c34',
    surface: '#2c313c',
    text: '#abb2bf',
    textSecondary: '#5c6370',
    syntax: {
      keyword: '#c678dd', string_: '#98c379', number: '#d19a66', comment: '#5c6370',
      key: '#61afef', section: '#e5c07b', error: '#e06c75', warning: '#e5c07b',
      info: '#61afef', variable: '#e06c75',
    },
  },

  // ═══ New high-contrast themes ═══

  'dracula': {
    primary: '#bd93f9',
    bg: '#282a36',
    surface: '#343746',
    text: '#f8f8f2',
    textSecondary: '#6272a4',
    syntax: {
      keyword: '#ff79c6', string_: '#50fa7b', number: '#bd93f9', comment: '#6272a4',
      key: '#8be9fd', section: '#f1fa8c', error: '#ff5555', warning: '#f1fa8c',
      info: '#8be9fd', variable: '#ffb86c',
    },
  },

  'nord': {
    primary: '#88c0d0',
    bg: '#2e3440',
    surface: '#3b4252',
    text: '#eceff4',
    textSecondary: '#81a1c1',
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
    primary: '#cba6f7',
    bg: '#1e1e2e',
    surface: '#313244',
    text: '#cdd6f4',
    textSecondary: '#6c7086',
    syntax: {
      keyword: '#cba6f7', string_: '#a6e3a1', number: '#fab387', comment: '#6c7086',
      key: '#89b4fa', section: '#f9e2af', error: '#f38ba8', warning: '#f9e2af',
      info: '#89dceb', variable: '#f38ba8',
    },
  },

  'gruvbox-dark': {
    primary: '#83a598',
    bg: '#282828',
    surface: '#3c3836',
    text: '#ebdbb2',
    textSecondary: '#a89984',
    syntax: {
      keyword: '#d3869b', string_: '#b8bb26', number: '#fe8019', comment: '#928374',
      key: '#83a598', section: '#fabd2f', error: '#fb4934', warning: '#fabd2f',
      info: '#8ec07c', variable: '#fb4934',
    },
  },
}

function buildPalette(def: ThemeDef): Record<string, string> {
  const { primary, bg, surface, text, textSecondary } = def

  // Derive background hierarchy from bg→surface
  const bgApp = bg
  const bgPrimary = lerpColor(bg, surface, 0.3)
  const bgSidebar = surface
  const bgSurface = surface
  const bgToolbar = lighten(surface, 0.03)
  const bgPanel = lerpColor(bg, surface, 0.15)
  const bgInput = lighten(surface, 0.03)

  // Derive text hierarchy from text→textSecondary→bg
  const textPrimary = text
  const textRegular = lerpColor(text, bg, 0.15)
  const textSec = textSecondary
  const textPlaceholder = lerpColor(textSecondary, bg, 0.3)
  const textMuted = lerpColor(textSecondary, bg, 0.5)

  // Derive border from text alpha
  const border = rgba(text, 0.08)
  const borderLight = rgba(text, 0.05)
  const borderFocus = primary

  return {
    '--color-primary': primary,
    '--color-primary-light': lighten(primary, 0.12),
    '--color-primary-dark': darken(primary, 0.1),

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

    '--color-bg-hover': rgba(primary, 0.08),
    '--color-bg-active': rgba(primary, 0.14),
    '--color-bg-primary-hover': rgba(primary, 0.12),

    '--color-bg-message-user': lighten(bg, 0.04),
    '--color-bg-message-ai': bg,

    '--color-border': border,
    '--color-border-light': borderLight,
    '--color-border-focus': borderFocus,

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
    '--terminal-black': darken(bgApp, 0.04),
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
    // Custom: start from termius-dark base, overlay user overrides
    tokens = { ...PALETTES['termius-dark'] }
    // Map ThemeColors (syntax-highlight oriented keys) to CSS custom properties
    const overrides: Record<string, string> = {
      '--color-bg-app': customColors.bg,
      '--color-bg-primary': customColors.bg,
      '--color-bg-surface': customColors.surface,
      '--color-bg-sidebar': customColors.surface,
      '--color-bg-toolbar': lighten(customColors.surface, 0.03),
      '--color-bg-panel': customColors.bg,
      '--color-bg-input': lighten(customColors.surface, 0.03),
      '--color-text-primary': customColors.text,
      '--color-text-regular': lerpColor(customColors.text, customColors.bg, 0.15),
      '--color-text-secondary': customColors.textSecondary,
      '--color-text-placeholder': lerpColor(customColors.textSecondary, customColors.bg, 0.3),
      '--color-text-muted': lerpColor(customColors.textSecondary, customColors.bg, 0.5),
    }
    Object.assign(tokens, overrides)
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
