/**
 * 终端 & 行为设置 store
 * 字号、字体、光标样式、回滚行数、选中即复制等 —— 持久化到 localStorage
 * 由 XTermFrontend 读取应用；settingsVersion 变化触发终端热更新
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type CursorStyle = 'bar' | 'block' | 'underline'

export interface TerminalSettings {
  fontSize: number
  fontFamily: string
  cursorStyle: CursorStyle
  cursorBlink: boolean
  scrollback: number
  copyOnSelect: boolean
  // 行为
  confirmClose: boolean
  showSplash: boolean
}

export const FONT_PRESETS = [
  "'JetBrains Mono','Fira Code','Consolas',monospace",
  "'Cascadia Code','Consolas',monospace",
  "'Fira Code',monospace",
  "'Source Code Pro',monospace",
  "'Consolas','Courier New',monospace",
  "'Menlo','Monaco',monospace",
]

const DEFAULTS: TerminalSettings = {
  fontSize: 13,
  fontFamily: FONT_PRESETS[0],
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 10000,
  copyOnSelect: false,
  confirmClose: false,
  showSplash: true,
}

const STORAGE_KEY = 'terminal-settings'

export const useTerminalSettingsStore = defineStore('terminalSettings', () => {
  const settings = ref<TerminalSettings>(load())
  const version = ref(0) // 递增触发终端重新应用

  function load(): TerminalSettings {
    try {
      const s = localStorage.getItem(STORAGE_KEY)
      if (s) return { ...DEFAULTS, ...JSON.parse(s) }
    } catch {}
    return { ...DEFAULTS }
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value)) } catch {}
  }

  function set<K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) {
    settings.value[key] = value
    save()
    version.value++
  }

  function reset() {
    settings.value = { ...DEFAULTS }
    save()
    version.value++
  }

  /** 取 xterm 可用的选项子集 */
  const xtermOptions = computed(() => ({
    fontSize: settings.value.fontSize,
    fontFamily: settings.value.fontFamily,
    cursorStyle: settings.value.cursorStyle,
    cursorBlink: settings.value.cursorBlink,
    scrollback: settings.value.scrollback,
  }))

  return { settings, version, xtermOptions, set, reset }
})
