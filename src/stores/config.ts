import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { applyTheme } from '@/utils/theme'

export type ColorScheme = 'termius-dark' | 'xterminal' | 'monokai' | 'one-dark' | 'custom'
export interface ThemeColors { bg: string; surface: string; text: string; textSecondary: string; keyword: string; string: string; number: string; comment: string; key: string; section: string; error: string; warning: string; info: string; variable: string; terminalBg: string; terminalFg: string; terminalCursor: string }

const THEMES: Record<string, ThemeColors> = {
  'termius-dark': { bg: '#0d0d1a', surface: '#1b1b2f', text: '#e8e8f0', textSecondary: '#8888a0', keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', comment: '#546e7a', key: '#89ddff', section: '#ffcb6b', error: '#ff5370', warning: '#ffcb6b', info: '#82aaff', variable: '#f07178', terminalBg: '#0d0d1a', terminalFg: '#e8e8f0', terminalCursor: '#5b8def' },
  'xterminal': { bg: '#1a1b26', surface: '#24283b', text: '#c0caf5', textSecondary: '#565f89', keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', comment: '#565f89', key: '#7dcfff', section: '#e0af68', error: '#f7768e', warning: '#e0af68', info: '#7aa2f7', variable: '#bb9af7', terminalBg: '#1a1b26', terminalFg: '#c0caf5', terminalCursor: '#7dcfff' },
  'monokai': { bg: '#272822', surface: '#383830', text: '#f8f8f2', textSecondary: '#75715e', keyword: '#f92672', string: '#e6db74', number: '#ae81ff', comment: '#75715e', key: '#66d9ef', section: '#e6db74', error: '#f92672', warning: '#e6db74', info: '#66d9ef', variable: '#f92672', terminalBg: '#272822', terminalFg: '#f8f8f2', terminalCursor: '#a6e22e' },
  'one-dark': { bg: '#282c34', surface: '#2c313c', text: '#abb2bf', textSecondary: '#5c6370', keyword: '#c678dd', string: '#98c379', number: '#d19a66', comment: '#5c6370', key: '#61afef', section: '#e5c07b', error: '#e06c75', warning: '#e5c07b', info: '#61afef', variable: '#e06c75', terminalBg: '#282c34', terminalFg: '#abb2bf', terminalCursor: '#528bff' },
}

export const useConfigStore = defineStore('config', () => {
  const defaultModel = ref('deepseek-chat'); const hasToken = ref(false)
  const colorScheme = ref<ColorScheme>('termius-dark'); const customColors = ref<ThemeColors>(THEMES['termius-dark'])
  const currentColors = computed<ThemeColors>(() => colorScheme.value === 'custom' ? customColors.value : (THEMES[colorScheme.value] || THEMES['termius-dark']))
  async function init() { hasToken.value = !!localStorage.getItem('ai-model-configs'); try { const s = localStorage.getItem('color-scheme'); if (s) { const p = JSON.parse(s); colorScheme.value = p.scheme || 'termius-dark'; if (p.custom) customColors.value = { ...customColors.value, ...p.custom } } } catch {}; applyTheme(colorScheme.value, customColors.value) }
  function setScheme(scheme: ColorScheme) { colorScheme.value = scheme; localStorage.setItem('color-scheme', JSON.stringify({ scheme, custom: colorScheme.value === 'custom' ? customColors.value : undefined })); applyTheme(scheme, scheme === 'custom' ? customColors.value : undefined) }
  function updateCustomColor(key: keyof ThemeColors, value: string) { customColors.value = { ...customColors.value, [key]: value }; localStorage.setItem('color-scheme', JSON.stringify({ scheme: 'custom', custom: customColors.value })); applyTheme('custom', customColors.value) }
  return { defaultModel, hasToken, colorScheme, customColors, currentColors, init, setScheme, updateCustomColor }
})
