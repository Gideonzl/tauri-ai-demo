/**

 * 主布局 — Termius极简三栏可伸缩布局

 * 左侧菜单栏：可拖拽伸缩（48~200px，默认56px）

 * 右侧AI面板：可拖拽伸缩（200~600px，默认320px），可收起

 * 中间服务器区：flex:1 自适应

 */

<template>

  <div class="app-shell" @contextmenu.self.prevent="onPageCtx">

    <!-- 顶部品牌导航栏 -->
    <header class="app-topbar">
      <div class="tb-brand">
        <img src="/app-icon.png?v=2" class="tb-logo" alt="" />
        <span class="tb-name">AITerminal</span>
        <span class="tb-badge">{{ isTauriMode ? 'Console' : 'Web' }}</span>
      </div>
      <div class="tb-spacer"></div>
      <button class="tb-cmd" @click="showCmdPalette = true">
        <el-icon :size="13"><Search /></el-icon>
        <span class="tb-cmd-text">{{ t('cmd.title') }}</span>
        <span class="tb-kbd">Ctrl K</span>
      </button>
      <button class="tb-icon-btn" :title="t('nav.settings')" @click="goSettings">
        <el-icon :size="16"><Setting /></el-icon>
      </button>
    </header>

    <div class="main-layout">

    <!-- 左侧导航菜单栏 -->

    <aside class="sidebar" :style="{ width: sidebarWidth + 'px' }">

      <SideNav />

    </aside>



    <!-- 左侧栏右边缘拖拽条 -->

    <div class="resize-bar" @mousedown="onSidebarResizeStart" />



    <!-- 中间服务器连接工作区 -->
    <!-- KeepAlive: 防止切换标签时销毁 WorkspaceView，保持 SSH 会话不中断 -->
    <main class="workspace">
      <router-view v-slot="{ Component }">
        <keep-alive>
          <component :is="Component" />
        </keep-alive>
      </router-view>
    </main>



    <!-- 右侧AI面板左边缘拖拽条（仅展开时） -->

    <div

      v-if="!aiPanelCollapsed"

      class="resize-bar"

      @mousedown="onAiPanelResizeStart"

    />



    <!-- 右侧AI对话面板 -->

    <aside

      class="ai-panel"

      :class="{ collapsed: aiPanelCollapsed }"

      :style="{ width: (aiPanelCollapsed ? aiPanelCollapsedWidth : aiPanelWidth) + 'px' }"

    >

      <!-- 顶部栏：toggle箭头 + 标签页切换 -->

      <div class="ai-top-bar">

        <div class="ai-toggle-btn" @click="toggleAiPanel">

          <el-icon :size="12">

            <component :is="aiPanelCollapsed ? 'DArrowLeft' : 'DArrowRight'" />

          </el-icon>

        </div>

        <template v-if="!aiPanelCollapsed">

          <div class="right-tabs">

            <button

              class="right-tab"

              :class="{ active: rightPanelTab === 'ai' }"

              @click="rightPanelTab = 'ai'"

            >{{ t('ai.title') }}</button>

            <button

              class="right-tab"

              :class="{ active: rightPanelTab === 'monitor' }"

              @click="rightPanelTab = 'monitor'"

            >{{ t('monitor.title') }}</button>

          </div>

        </template>

      </div>

      <!-- 内容区：AI对话 / 系统监控 -->

      <div v-if="!aiPanelCollapsed" class="ai-body">

        <AiChat v-if="rightPanelTab === 'ai'" ref="aiChatRef" />

        <SystemMonitor v-else />

      </div>

    </aside>

    </div>
    <!-- /main-layout -->

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>

    <!-- AI 命令助手悬浮按钮（可拖拽） -->
    <button
      class="cmd-fab"
      :class="{ dragging: fabDragging }"
      :style="fabStyle"
      :title="t('cmd.openHint') + ' (Ctrl+K)'"
      @mousedown="fabMouseDown"
    >
      <el-icon :size="20"><MagicStick /></el-icon>
    </button>

    <!-- AI 命令助手浮层 -->
    <AiCommandPalette v-model="showCmdPalette" />
  </div>

</template>



<script setup lang="ts">

import { ref, reactive, onMounted, onUnmounted, provide, computed } from 'vue'

import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useLocale } from '@/composables/useLocale'

import { DArrowLeft, DArrowRight, Refresh, MagicStick, Search, Setting } from '@element-plus/icons-vue'

import SideNav from '@/components/SideNav.vue'

import AiChat from '@/components/AiChat.vue'

import SystemMonitor from '@/components/SystemMonitor.vue'
import AiCommandPalette from '@/components/AiCommandPalette.vue'
import { useContextMenu } from '@/composables/useContextMenu'



const configStore = useConfigStore()
const { t } = useLocale()
const { register, unregister } = useContextMenu()
const router = useRouter()
const isTauriMode = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
function goSettings() { if (router.currentRoute.value.path !== '/settings') router.push('/settings') }

// 右键菜单
const ctx = reactive({ visible: false, x: 0, y: 0 })
function onPageCtx(e: MouseEvent) { ctx.x = e.clientX; ctx.y = e.clientY; ctx.visible = true }
function hideCtx() { ctx.visible = false }
function ctxAct(action: string) { hideCtx(); if (action === 'refresh') location.reload() }

// AI 命令助手（Ctrl+K 全局唤起）
const showCmdPalette = ref(false)
function onGlobalKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); showCmdPalette.value = true }
}

// 悬浮按钮拖拽 —— 拖动移位（记忆位置），轻点打开助手
const FAB_SIZE = 46
const fabPos = ref<{ x: number; y: number } | null>(null)
try { const s = localStorage.getItem('cmd-fab-pos'); if (s) fabPos.value = JSON.parse(s) } catch {}
const fabDragging = ref(false)
let fabMoved = false
let fabStartX = 0, fabStartY = 0, fabOrigX = 0, fabOrigY = 0

const fabStyle = computed(() => {
  if (!fabPos.value) return {}
  return { left: fabPos.value.x + 'px', top: fabPos.value.y + 'px', right: 'auto', bottom: 'auto' }
})

function fabMouseDown(e: MouseEvent) {
  fabMoved = false
  fabStartX = e.clientX; fabStartY = e.clientY
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  fabOrigX = rect.left; fabOrigY = rect.top
  document.addEventListener('mousemove', fabMouseMove)
  document.addEventListener('mouseup', fabMouseUp)
  e.preventDefault()
}
function fabMouseMove(e: MouseEvent) {
  const dx = e.clientX - fabStartX, dy = e.clientY - fabStartY
  if (!fabMoved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) fabDragging.value = fabMoved = true
  if (!fabMoved) return
  const x = Math.max(4, Math.min(window.innerWidth - FAB_SIZE - 4, fabOrigX + dx))
  const y = Math.max(4, Math.min(window.innerHeight - FAB_SIZE - 4, fabOrigY + dy))
  fabPos.value = { x, y }
}
function fabMouseUp() {
  document.removeEventListener('mousemove', fabMouseMove)
  document.removeEventListener('mouseup', fabMouseUp)
  if (!fabMoved) {
    showCmdPalette.value = true
  } else if (fabPos.value) {
    try { localStorage.setItem('cmd-fab-pos', JSON.stringify(fabPos.value)) } catch {}
  }
  fabDragging.value = false
}

onMounted(() => { register(hideCtx); document.addEventListener('click', hideCtx); document.addEventListener('keydown', onGlobalKey) })
onUnmounted(() => { unregister(hideCtx); document.removeEventListener('click', hideCtx); document.removeEventListener('keydown', onGlobalKey) })

const rightPanelTab = ref<'ai' | 'monitor'>('ai')



// AiChat组件引用（用于SFTP→AI联动）

const aiChatRef = ref<InstanceType<typeof AiChat> | null>(null)



// 提供AI注入方法给子组件（SFTP文件树等）

provide('injectFilePathToAI', (filePath: string, fileType: 'file' | 'directory', serverInfo?: string) => {

  aiChatRef.value?.injectFilePath(filePath, fileType, serverInfo)

})

provide('injectFileContentToAI', (filePath: string, content: string, serverInfo?: string) => {

  aiChatRef.value?.injectFileContent(filePath, content, serverInfo)

})
provide('sendTerminalToAI', (text: string, serverInfo?: string) => {

  aiChatRef.value?.injectTerminalText(text, serverInfo)

})



// === 左侧菜单栏伸缩 ===

const SIDEBAR_MIN = 48

const SIDEBAR_MAX = 200

const SIDEBAR_DEFAULT = 56

const sidebarWidth = ref(SIDEBAR_DEFAULT)



provide('sidebarWidth', sidebarWidth)



// === 右侧AI面板伸缩 ===

const AI_PANEL_MIN = 200

const AI_PANEL_MAX = 600

const AI_PANEL_DEFAULT = 320

const aiPanelWidth = ref(AI_PANEL_DEFAULT)

const aiPanelCollapsedWidth = 40

const aiPanelCollapsed = ref(false)

const aiPanelWidthBeforeCollapse = ref(AI_PANEL_DEFAULT)



// === 拖拽状态 ===

let resizing: 'sidebar' | 'ai-panel' | null = null

let resizeStartX = 0

let resizeStartWidth = 0



function onSidebarResizeStart(e: MouseEvent) {

  e.preventDefault()

  resizing = 'sidebar'

  resizeStartX = e.clientX

  resizeStartWidth = sidebarWidth.value

  document.addEventListener('mousemove', onResizeMove)

  document.addEventListener('mouseup', onResizeEnd)

  document.body.style.cursor = 'col-resize'

  document.body.style.userSelect = 'none'

}



function onAiPanelResizeStart(e: MouseEvent) {

  e.preventDefault()

  resizing = 'ai-panel'

  resizeStartX = e.clientX

  resizeStartWidth = aiPanelWidth.value

  document.addEventListener('mousemove', onResizeMove)

  document.addEventListener('mouseup', onResizeEnd)

  document.body.style.cursor = 'col-resize'

  document.body.style.userSelect = 'none'

}



function onResizeMove(e: MouseEvent) {

  if (!resizing) return

  const delta = e.clientX - resizeStartX



  if (resizing === 'sidebar') {

    sidebarWidth.value = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, resizeStartWidth + delta))

  } else if (resizing === 'ai-panel') {

    aiPanelWidth.value = Math.max(AI_PANEL_MIN, Math.min(AI_PANEL_MAX, resizeStartWidth - delta))

  }

}



function onResizeEnd() {

  resizing = null

  document.removeEventListener('mousemove', onResizeMove)

  document.removeEventListener('mouseup', onResizeEnd)

  document.body.style.cursor = ''

  document.body.style.userSelect = ''

}



function toggleAiPanel() {

  if (aiPanelCollapsed.value) {

    aiPanelWidth.value = aiPanelWidthBeforeCollapse.value

    aiPanelCollapsed.value = false

  } else {

    aiPanelWidthBeforeCollapse.value = aiPanelWidth.value

    aiPanelCollapsed.value = true

  }

}



onMounted(async () => {

  await configStore.init()

})



onUnmounted(() => {

  document.removeEventListener('mousemove', onResizeMove)

  document.removeEventListener('mouseup', onResizeEnd)

})

</script>



<style lang="scss" scoped>

.app-shell {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: $gradient-app;
}

// === 顶部品牌导航栏 ===
.app-topbar {
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
  background: $glass-bg;
  backdrop-filter: blur(12px) saturate(1.2);
  border-bottom: 1px solid $glass-border;
  z-index: 10;
}
.tb-brand { display: flex; align-items: center; gap: 8px; }
.tb-logo { width: 22px; height: 22px; border-radius: 6px; }
.tb-name { font-size: 15px; font-weight: 700; letter-spacing: -0.2px; color: $color-text-primary; font-family: 'Inter', sans-serif; }
.tb-badge {
  font-size: 9px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;
  color: $color-primary; background: $color-bg-active; padding: 2px 6px; border-radius: 4px;
}
.tb-spacer { flex: 1; }
.tb-cmd {
  display: flex; align-items: center; gap: 8px;
  height: 30px; padding: 0 10px; border: 1px solid $color-border;
  border-radius: $border-radius-md; background: $color-bg-input; cursor: pointer;
  color: $color-text-secondary; font-family: inherit; font-size: $font-size-xs;
  transition: all $transition-fast;
  &:hover { border-color: $color-primary; color: $color-text-primary; }
  .tb-kbd { font-family: $font-family-mono; font-size: 10px; color: $color-text-muted; background: $color-bg-app; padding: 1px 5px; border-radius: 3px; }
}
.tb-icon-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: $border-radius-md; background: transparent; cursor: pointer;
  color: $color-text-secondary; transition: all $transition-fast;
  &:hover { background: $color-bg-hover; color: $color-primary; }
}

.main-layout {

  display: flex;

  flex: 1;

  width: 100%;

  min-height: 0;

  overflow: hidden;

}



// === 左侧菜单栏 ===

.sidebar {

  height: 100%;

  background: $glass-bg;

  backdrop-filter: blur(10px) saturate(1.1);

  -webkit-backdrop-filter: blur(10px) saturate(1.1);

  border-right: 1px solid $glass-border;

  flex-shrink: 0;

  display: flex;

  flex-direction: column;

  overflow: hidden;

}



// === 拖拽条 ===

.resize-bar {

  width: 5px;

  height: 100%;

  flex-shrink: 0;

  cursor: col-resize;

  position: relative;

  z-index: 5;



  &::after {

    content: '';

    position: absolute;

    top: 0;

    bottom: 0;

    left: 50%;

    transform: translateX(-50%);

    width: 1px;

    background-color: transparent;

    transition: background-color 0.15s ease;

  }



  &:hover::after {

    background-color: $color-primary;

    box-shadow: $glow-soft;

  }

}



// === 中间工作区 ===

.workspace {

  flex: 1;

  min-width: 200px;

  overflow: hidden;

  display: flex;

  flex-direction: column;

  background-color: $color-bg-primary;

}



// === 右侧AI面板 — 纵向布局，顶部栏+内容区填满 ===

.ai-panel {

  height: 100%;

  background: $glass-bg;

  backdrop-filter: blur(10px) saturate(1.1);

  -webkit-backdrop-filter: blur(10px) saturate(1.1);

  border-left: 1px solid $glass-border;

  flex-shrink: 0;

  display: flex;

  flex-direction: column;

  overflow: hidden;

}



// 顶部栏：横向排列 toggle + 标题，填满宽度

.ai-top-bar {

  height: $header-height;

  display: flex;

  align-items: center;

  flex-shrink: 0;

  border-bottom: 1px solid $color-border-light;

  background-color: $color-bg-surface;

  padding: 0 $spacing-sm;

  gap: $spacing-xs;

}



// toggle按钮 — 小箭头，无背景

.ai-toggle-btn {

  width: 24px;

  height: 24px;

  display: flex;

  align-items: center;

  justify-content: center;

  cursor: pointer;

  color: $color-text-secondary;

  border-radius: $border-radius-sm;

  transition: color 0.15s ease;

  flex-shrink: 0;



  &:hover {

    color: $color-primary;

  }

}



// 标签页切换

.right-tabs {

  display: flex;

  gap: 2px;

  flex: 1;

  overflow: hidden;

}



.right-tab {

  padding: 4px 10px;

  border: none;

  border-radius: $border-radius-sm;

  cursor: pointer;

  font-size: $font-size-xs;

  font-weight: 500;

  color: $color-text-secondary;

  background: transparent;

  transition: all $transition-fast;

  white-space: nowrap;

  font-family: inherit;



  &:hover {

    color: $color-text-regular;

    background-color: $color-bg-hover;

  }



  &.active {

    color: $color-primary;

    background-color: $color-bg-active;

  }

}



// 对话内容 — 填满剩余空间

.ai-body {

  flex: 1;

  display: flex;

  flex-direction: column;

  overflow: hidden;

  min-width: 0;

  min-height: 0;

}

// AI 命令助手悬浮按钮
.cmd-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 15000;
  width: 46px;
  height: 46px;
  border: none;
  border-radius: 50%;
  cursor: grab;
  color: #fff;
  background: $gradient-primary;
  box-shadow: $elevation-2, $glow-soft;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
  user-select: none;
  -webkit-user-select: none;

  &:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: $elevation-3, $glow-primary;
  }
  &:active { transform: scale(0.96); }

  &.dragging {
    cursor: grabbing;
    transition: none;
    transform: scale(1.08);
    box-shadow: $elevation-3, $glow-primary;
  }
}

</style>

