/**
 * XTermFrontend — xterm.js wrapper with full Tabby feature parity
 *
 * Tabby's concrete implementations: XTermFrontend / XTermWebGLFrontend
 * We combine both: WebGL renderer (with DOM fallback) + all addons.
 *
 * Observable streams (Tabby pattern):
 *   input$:   Subject<string>          — keyboard events (xterm.onData)
 *   resize$:  Subject<{rows,cols}>     — dimension changes (ResizeObserver)
 *
 * Addons included (matching Tabby):
 *   FitAddon      — auto-size terminal to container
 *   WebglAddon    — GPU-accelerated rendering (falls back to DOM)
 *   SearchAddon   — Ctrl+Shift+F text search
 *   WebLinksAddon — clickable URLs with modifier key
 *   Unicode11Addon — wide character / emoji support
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { Subject } from '@/sessions/Observable'

// ── Theme ──
const DEFAULT_THEME = {
  background: '#0d0d1a',
  foreground: '#e8e8f0',
  cursor: '#5b8def',
  cursorAccent: '#0d0d1a',
  selectionBackground: 'rgba(91,155,213,0.35)',
  selectionForeground: '#fff',
  black: '#1a1a2e',
  red: '#ff5370',
  green: '#c3e88d',
  yellow: '#ffcb6b',
  blue: '#82aaff',
  magenta: '#c792ea',
  cyan: '#89ddff',
  white: '#e8e8f0',
  brightBlack: '#444460',
  brightRed: '#ff5370',
  brightGreen: '#c3e88d',
  brightYellow: '#ffcb6b',
  brightBlue: '#82aaff',
  brightMagenta: '#c792ea',
  brightCyan: '#89ddff',
  brightWhite: '#fff',
}

export class XTermFrontend {
  // ── Observable streams (Tabby: input$, resize$) ──
  readonly input$ = new Subject<string>()
  readonly resize$ = new Subject<{ rows: number; cols: number }>()

  private terminal: Terminal
  private fitAddon: FitAddon
  private searchAddon: SearchAddon
  private resizeObserver: ResizeObserver | null = null
  private _element: HTMLElement | null = null

  constructor() {
    this.terminal = new Terminal({
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
      theme: DEFAULT_THEME,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 10000,
      cols: 80,
      rows: 24,
      allowProposedApi: true, // required for some addons
    })

    // ── Load addons (Tabby: all addons loaded in XTermFrontend constructor) ──

    // Fit — auto-size to container
    this.fitAddon = new FitAddon()
    this.terminal.loadAddon(this.fitAddon)

    // WebGL — GPU-accelerated rendering (falls back to DOM renderer if WebGL unavailable)
    try {
      this.terminal.loadAddon(new WebglAddon())
    } catch {
      console.warn('[XTermFrontend] WebGL unavailable, using DOM renderer')
    }

    // Search — Ctrl+Shift+F
    this.searchAddon = new SearchAddon()
    this.terminal.loadAddon(this.searchAddon)

    // Web links — Ctrl+Click to open URLs
    this.terminal.loadAddon(new WebLinksAddon())

    // Unicode 11 — wide character / emoji support
    this.terminal.loadAddon(new Unicode11Addon())
    this.terminal.unicode.activeVersion = '11'

    // ── Keyboard input → input$ stream (Tabby: xterm.onData → input$) ──
    this.terminal.onData((data: string) => {
      this.input$.next(data)
    })

    // ── Smart copy / paste key bindings ──
    // Ctrl+C: copy selection if any (else fall through to SIGINT ^C)
    // Ctrl+V: paste from clipboard
    // Ctrl+Shift+C / Ctrl+Shift+V: always copy / paste
    this.terminal.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      if (e.type !== 'keydown') return true
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return true
      const key = e.key.toLowerCase()

      // Copy
      if (key === 'c') {
        const sel = this.terminal.getSelection()
        if (e.shiftKey) {
          if (sel) navigator.clipboard.writeText(sel).catch(() => {})
          return false
        }
        // Plain Ctrl+C: copy only when there is a selection, else let ^C through
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {})
          this.terminal.clearSelection()
          return false
        }
        return true
      }

      // Paste (Ctrl+V / Ctrl+Shift+V): suppress the ^V control char and let the
      // browser's native paste event insert the text (avoids double paste).
      if (key === 'v') {
        return false
      }

      return true
    })
  }

  // ── Settings (font / cursor / scrollback / copy-on-select) ──

  private copyOnSelect = false
  private selectionDisposable: { dispose: () => void } | null = null

  /** Apply user terminal settings live (called on mount + on settings change) */
  applySettings(opts: {
    fontSize?: number
    fontFamily?: string
    cursorStyle?: 'bar' | 'block' | 'underline'
    cursorBlink?: boolean
    scrollback?: number
    copyOnSelect?: boolean
  }): void {
    const o = this.terminal.options
    if (opts.fontSize != null) o.fontSize = opts.fontSize
    if (opts.fontFamily != null) o.fontFamily = opts.fontFamily
    if (opts.cursorStyle != null) o.cursorStyle = opts.cursorStyle
    if (opts.cursorBlink != null) o.cursorBlink = opts.cursorBlink
    if (opts.scrollback != null) o.scrollback = opts.scrollback

    // copy-on-select
    if (opts.copyOnSelect != null && opts.copyOnSelect !== this.copyOnSelect) {
      this.copyOnSelect = opts.copyOnSelect
      this.selectionDisposable?.dispose()
      this.selectionDisposable = null
      if (this.copyOnSelect) {
        this.selectionDisposable = this.terminal.onSelectionChange(() => {
          const sel = this.terminal.getSelection()
          if (sel) navigator.clipboard.writeText(sel).catch(() => {})
        })
      }
    }

    // Font change requires a refit
    if (opts.fontSize != null || opts.fontFamily != null) {
      try { this.fitAddon.fit() } catch {}
      this.resize$.next({ rows: this.terminal.rows, cols: this.terminal.cols })
    }
  }

  // ── Lifecycle ──

  /** Mount the terminal into a DOM element */
  open(el: HTMLElement): void {
    this._element = el
    this.terminal.open(el)
    this.fitAddon.fit()

    // ResizeObserver → fit + emit resize$ (Tabby: resize$ Subject)
    this.resizeObserver = new ResizeObserver(() => {
      this.fitAddon.fit()
      this.resize$.next({
        rows: this.terminal.rows,
        cols: this.terminal.cols,
      })
    })
    this.resizeObserver.observe(el)

    setTimeout(() => this.terminal.focus(), 80)
  }

  /** Release all resources */
  dispose(): void {
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.selectionDisposable?.dispose()
    this.selectionDisposable = null
    this.terminal.dispose()
    this.input$.complete()
    this.resize$.complete()
    this._element = null
  }

  // ── Output (called by session) ──

  /** Write raw data to terminal (Tabby: frontend.write) */
  write(data: string): void {
    this.terminal.write(data)
  }

  /** Write data + \\r\\n */
  writeln(data: string): void {
    this.terminal.writeln(data)
  }

  // ── Search (Tabby: Ctrl+Shift+F → search bar) ──

  /** Show the search addon bar */
  showSearch(): void {
    this.searchAddon.show()
  }

  /** Find next search match */
  findNext(query: string): void {
    this.searchAddon.findNext(query)
  }

  /** Find previous search match */
  findPrevious(query: string): void {
    this.searchAddon.findPrevious(query)
  }

  // ── Control ──

  clear(): void {
    this.terminal.clear()
  }

  focus(): void {
    this.terminal.focus()
  }

  selectAll(): void {
    this.terminal.selectAll()
  }

  async copySelection(): Promise<void> {
    const text = this.terminal.getSelection()
    if (text) {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Fallback for older browsers
      }
    }
  }

  async paste(): Promise<void> {
    try {
      const text = await navigator.clipboard.readText()
      if (text) this.input$.next(text)
    } catch {
      // Clipboard not available
    }
  }

  // ── Theme ──

  /** Update xterm theme from CSS custom properties on :root (called on theme change) */
  updateTheme(): void {
    const s = getComputedStyle(document.documentElement)
    const read = (prop: string, fallback: string) => (s.getPropertyValue(prop).trim() || fallback)

    this.terminal.options.theme = {
      background: read('--terminal-bg', '#0d0d1a'),
      foreground: read('--terminal-fg', '#e8e8f0'),
      cursor: read('--terminal-cursor', '#5b8def'),
      cursorAccent: read('--terminal-bg', '#0d0d1a'),
      selectionBackground: read('--terminal-cursor', 'rgba(91,155,213,0.35)'),
      black: read('--terminal-black', '#1a1a2e'),
      red: read('--terminal-red', '#ff5370'),
      green: read('--terminal-green', '#c3e88d'),
      yellow: read('--terminal-yellow', '#ffcb6b'),
      blue: read('--terminal-blue', '#82aaff'),
      magenta: read('--terminal-magenta', '#c792ea'),
      cyan: read('--terminal-cyan', '#89ddff'),
      white: read('--terminal-white', '#e8e8f0'),
      brightBlack: read('--terminal-bright-black', '#444460'),
      brightRed: read('--terminal-bright-red', '#ff5370'),
      brightGreen: read('--terminal-bright-green', '#c3e88d'),
      brightYellow: read('--terminal-bright-yellow', '#ffcb6b'),
      brightBlue: read('--terminal-bright-blue', '#82aaff'),
      brightMagenta: read('--terminal-bright-magenta', '#c792ea'),
      brightCyan: read('--terminal-bright-cyan', '#89ddff'),
      brightWhite: read('--terminal-bright-white', '#fff'),
    }
  }

  // ── Getters ──

  get element(): HTMLElement | undefined {
    return this.terminal.element
  }

  get cols(): number {
    return this.terminal.cols
  }

  get rows(): number {
    return this.terminal.rows
  }
}
