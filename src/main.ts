/**
 * 应用入口文件
 * 初始化 Vue3、Pinia、Element Plus、路由、i18n
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import en from 'element-plus/es/locale/lang/en'

import App from './App.vue'
import router from './router'
import { useModelStore } from './stores/model'
import { useChatStore } from './stores/chat'
import { applyTheme } from './utils/theme'
import { initContextMenuCoordinator } from './composables/useContextMenu'
import './assets/styles/global.scss'

// Global right-click coordinator — capture phase closes all menus before any opens
initContextMenuCoordinator()

// Early theme application — prevents flash of unstyled content (FOUC)
// Must run BEFORE app.mount() so CSS custom properties exist on :root
try {
  const raw = localStorage.getItem('color-scheme')
  if (raw) {
    const p = JSON.parse(raw)
    applyTheme(p.scheme || 'min-light', p.custom)
  } else {
    applyTheme('min-light')
  }
} catch {
  applyTheme('min-light')
}

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Element Plus locale — follow user's language preference
const savedLocale = localStorage.getItem('app-locale') || 'zh-CN'
app.use(ElementPlus, { locale: savedLocale === 'en' ? en : zhCn })

// 注册所有 Element Plus 图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.mount('#app')

// 初始化 stores
const modelStore = useModelStore()
modelStore.init()
const chatStore = useChatStore()
chatStore.init()
