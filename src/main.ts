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
import './assets/styles/global.scss'

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
