/**
 * Vue Router 配置 — 三栏布局路由
 * / → 服务器连接工作区
 * /ai-config → AI模型管理（独立页面）
 * /settings → 设置（预留）
 */
import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/views/MainLayout.vue'),
    children: [
      {
        path: '',
        name: 'Workspace',
        component: () => import('@/views/WorkspaceView.vue'),
      },
      {
        path: 'ai-config',
        name: 'AiConfig',
        component: () => import('@/views/AiConfigView.vue'),
      },
      {
        path: 'history',
        name: 'CommandHistory',
        component: () => import('@/views/CommandHistoryView.vue'),
      },
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue'),
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
