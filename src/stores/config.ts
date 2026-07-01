import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { applyTheme } from '@/utils/theme'

export type ColorScheme = 'tech' | 'termius-dark' | 'xterminal' | 'monokai' | 'one-dark' | 'dracula' | 'nord' | 'high-contrast' | 'catppuccin' | 'gruvbox-dark' | 'one-light' | 'github-light' | 'solarized-light' | 'min-light' | 'custom'
export interface ThemeColors { bg: string; surface: string; text: string; textSecondary: string; keyword: string; string: string; number: string; comment: string; key: string; section: string; error: string; warning: string; info: string; variable: string; terminalBg: string; terminalFg: string; terminalCursor: string }

const THEMES: Record<string, ThemeColors> = {
  'tech': { bg: '#0a0e17', surface: '#141b2b', text: '#e6edf7', textSecondary: '#8b99b4', keyword: '#60a5fa', string: '#4ade80', number: '#fbbf24', comment: '#5a6785', key: '#38bdf8', section: '#a78bfa', error: '#f87171', warning: '#fbbf24', info: '#38bdf8', variable: '#f472b6', terminalBg: '#0a0e17', terminalFg: '#e6edf7', terminalCursor: '#3b82f6' },
  'termius-dark': { bg: '#0d0d1a', surface: '#1b1b2f', text: '#e8e8f0', textSecondary: '#8888a0', keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', comment: '#546e7a', key: '#89ddff', section: '#ffcb6b', error: '#ff5370', warning: '#ffcb6b', info: '#82aaff', variable: '#f07178', terminalBg: '#0d0d1a', terminalFg: '#e8e8f0', terminalCursor: '#5b8def' },
  'xterminal': { bg: '#1a1b26', surface: '#24283b', text: '#c0caf5', textSecondary: '#565f89', keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', key: '#7dcfff', section: '#e0af68', error: '#f7768e', warning: '#e0af68', info: '#7aa2f7', variable: '#bb9af7', terminalBg: '#1a1b26', terminalFg: '#c0caf5', terminalCursor: '#7dcfff' },
  'monokai': { bg: '#272822', surface: '#383830', text: '#f8f8f2', textSecondary: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', key: '#66d9ef', section: '#e6db74', error: '#f92672', warning: '#e6db74', info: '#66d9ef', variable: '#f92672', terminalBg: '#272822', terminalFg: '#f8f8f2', terminalCursor: '#a6e22e' },
  'one-dark': { bg: '#282c34', surface: '#2c313c', text: '#abb2bf', textSecondary: '#5c6370', keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', key: '#61afef', section: '#e5c07b', error: '#e06c75', warning: '#e5c07b', info: '#61afef', variable: '#e06c75', terminalBg: '#282c34', terminalFg: '#abb2bf', terminalCursor: '#528bff' },
  'dracula': { bg: '#282a36', surface: '#343746', text: '#f8f8f2', textSecondary: '#6272a4', keyword: '#ff79c6', string: '#50fa7b', number: '#bd93f9', comment: '#6272a4', key: '#8be9fd', section: '#f1fa8c', error: '#ff5555', warning: '#f1fa8c', info: '#8be9fd', variable: '#ffb86c', terminalBg: '#282a36', terminalFg: '#f8f8f2', terminalCursor: '#bd93f9' },
  'nord': { bg: '#2e3440', surface: '#3b4252', text: '#eceff4', textSecondary: '#81a1c1', keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', comment: '#4c566a', key: '#88c0d0', section: '#ebcb8b', error: '#bf616a', warning: '#d08770', info: '#5e81ac', variable: '#d08770', terminalBg: '#2e3440', terminalFg: '#eceff4', terminalCursor: '#88c0d0' },
  'high-contrast': { bg: '#000000', surface: '#1a1a1a', text: '#ffffff', textSecondary: '#cccccc', keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', comment: '#6a9955', key: '#9cdcfe', section: '#dcdcaa', error: '#f44747', warning: '#cca700', info: '#4ec9b0', variable: '#9cdcfe', terminalBg: '#000000', terminalFg: '#ffffff', terminalCursor: '#4da6ff' },
  'catppuccin': { bg: '#1e1e2e', surface: '#313244', text: '#cdd6f4', textSecondary: '#6c7086', keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', comment: '#6c7086', key: '#89b4fa', section: '#f9e2af', error: '#f38ba8', warning: '#f9e2af', info: '#89dceb', variable: '#f38ba8', terminalBg: '#1e1e2e', terminalFg: '#cdd6f4', terminalCursor: '#cba6f7' },
  'gruvbox-dark': { bg: '#282828', surface: '#3c3836', text: '#ebdbb2', textSecondary: '#a89984', keyword: '#d3869b', string: '#b8bb26', number: '#fe8019', comment: '#928374', key: '#83a598', section: '#fabd2f', error: '#fb4934', warning: '#fabd2f', info: '#8ec07c', variable: '#fb4934', terminalBg: '#282828', terminalFg: '#ebdbb2', terminalCursor: '#83a598' },
}

export const useConfigStore = defineStore('config', () => {
  const defaultModel = ref('deepseek-chat'); const hasToken = ref(false)
  const colorScheme = ref<ColorScheme>('tech'); const customColors = ref<ThemeColors>(THEMES['tech'])
  const currentColors = computed<ThemeColors>(() => colorScheme.value === 'custom' ? customColors.value : (THEMES[colorScheme.value] || THEMES['tech']))
  async function init() {
    hasToken.value = !!localStorage.getItem('ai-model-configs')
    try {
      const s = localStorage.getItem('color-scheme')
      if (s) { const p = JSON.parse(s); colorScheme.value = p.scheme || 'tech'; if (p.custom) customColors.value = { ...customColors.value, ...p.custom } }
    } catch {}
    // One-time migration to the new professional "tech" default —
    // only for users still on the old default theme (respects deliberate choices).
    try {
      if (!localStorage.getItem('design-v2')) {
        localStorage.setItem('design-v2', '1')
        if (colorScheme.value === 'termius-dark') {
          colorScheme.value = 'tech'
          localStorage.setItem('color-scheme', JSON.stringify({ scheme: 'tech' }))
        }
      }
    } catch {}
    applyTheme(colorScheme.value, customColors.value)
  }
  function setScheme(scheme: ColorScheme) { colorScheme.value = scheme; localStorage.setItem('color-scheme', JSON.stringify({ scheme, custom: colorScheme.value === 'custom' ? customColors.value : undefined })); applyTheme(scheme, scheme === 'custom' ? customColors.value : undefined) }
  function updateCustomColor(key: keyof ThemeColors, value: string) { customColors.value = { ...customColors.value, [key]: value }; localStorage.setItem('color-scheme', JSON.stringify({ scheme: 'custom', custom: customColors.value })); applyTheme('custom', customColors.value) }
  return { defaultModel, hasToken, colorScheme, customColors, currentColors, init, setScheme, updateCustomColor }
})
