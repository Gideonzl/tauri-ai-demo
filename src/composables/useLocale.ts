/**
 * 轻量级 i18n — 无额外依赖
 * 支持 en / zh-CN，localStorage 持久化
 */
import { ref, computed } from 'vue'
import en from '@/i18n/en.json'
import zhCN from '@/i18n/zh-CN.json'

export type Locale = 'en' | 'zh-CN'

const messages: Record<Locale, Record<string, any>> = { en, 'zh-CN': zhCN }

const currentLocale = ref<Locale>(
  (localStorage.getItem('app-locale') as Locale) || 'zh-CN'
)

/** 切换语言 */
function setLocale(locale: Locale) {
  currentLocale.value = locale
  localStorage.setItem('app-locale', locale)
}

/** 翻译函数：t('nav.hosts') → '主机'，支持 {n} 占位 */
function t(key: string, params?: Record<string, string | number>): string {
  const keys = key.split('.')
  let val: any = messages[currentLocale.value]
  for (const k of keys) {
    val = val?.[k]
    if (val === undefined) break
  }
  if (typeof val !== 'string') {
    // fallback to English
    let fallback: any = messages['en']
    for (const k of keys) {
      fallback = fallback?.[k]
      if (fallback === undefined) break
    }
    val = typeof fallback === 'string' ? fallback : key
  }
  if (params) {
    return Object.entries(params).reduce(
      (s, [k, v]) => s.replace(`{${k}}`, String(v)),
      val
    )
  }
  return val
}

export function useLocale() {
  return {
    locale: computed(() => currentLocale.value),
    setLocale,
    t,
    locales: [
      { value: 'zh-CN' as Locale, label: '简体中文' },
      { value: 'en' as Locale, label: 'English' },
    ],
  }
}
