/**

 * 主布局 — Termius极简三栏可伸缩布局

 * 左侧菜单栏：可拖拽伸缩（48~200px，默认56px）

 * 右侧AI面板：可拖拽伸缩（200~600px，默认320px），可收起

 * 中间服务器区：flex:1 自适应

 */

<template>

  <div class="app-shell" @contextmenu.self.prevent="onPageCtx">
    <div class="shell-aurora shell-aurora-a"></div>
    <div class="shell-aurora shell-aurora-b"></div>

    <!-- 顶部品牌导航栏 -->
    <header v-if="!terminalFocusMode" class="app-topbar">
      <div class="tb-brand">
        <img src="/app-icon.png?v=2" class="tb-logo" alt="" />
        <span class="tb-name">AITerminal</span>
        <span class="tb-badge">{{ isTauriMode ? 'Console' : 'Web' }}</span>
      </div>
      <div class="tb-status-strip">
        <span class="tb-status-dot"></span>
        <span>SSH Mesh</span>
        <span>AI Ops</span>
        <span>Secure Runbooks</span>
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
      <button class="tb-focus-btn" title="专注终端模式" @click="toggleTerminalFocusMode">专注终端</button>
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

      class="resize-bar ai-resize-bar"

      :class="{ dragging: isAiPanelResizing }"

      role="separator"

      aria-orientation="vertical"

      aria-label="Resize AI panel"

      @pointerdown="onAiPanelResizeStart"

      @dblclick="resetAiPanelWidth"

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

          <button class="ai-panel-close" :title="t('common.close')" :aria-label="t('common.close')" @click="toggleAiPanel">
            <el-icon :size="15"><Close /></el-icon>
          </button>

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

    <!-- 全局可拖拽的 AI 命令助手入口，避免遮挡当前工作区内容 -->
    <button
      v-if="cmdFabReady"
      class="cmd-fab"
      :class="{ dragging: isCmdFabDragging }"
      :style="cmdFabStyle"
      :title="t('cmd.openHint') + ' (Ctrl+K)'"
      @pointerdown="onCmdFabPointerDown"
      @click="openCmdPaletteFromFab"
    >
      <span class="cmd-fab-ring"></span>
      <el-icon :size="20"><MagicStick /></el-icon>
    </button>

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>

    <!-- AI 命令助手浮层 -->
    <AiCommandPalette v-model="showCmdPalette" />
  </div>

</template>



<script setup lang="ts">

import { ref, reactive, onMounted, onUnmounted, provide, computed, nextTick } from 'vue'

import { useRouter } from 'vue-router'
import { useConfigStore } from '@/stores/config'
import { useLocale } from '@/composables/useLocale'

import { DArrowLeft, DArrowRight, Refresh, MagicStick, Search, Setting, Close } from '@element-plus/icons-vue'

import SideNav from '@/components/SideNav.vue'

import AiChat from '@/components/AiChat.vue'

import SystemMonitor from '@/components/SystemMonitor.vue'
import AiCommandPalette from '@/components/AiCommandPalette.vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { TERMINAL_FOCUS_STORAGE_KEY } from '@/utils/terminalFocusLayout'



const configStore = useConfigStore()
const { t } = useLocale()
const { register, unregister } = useContextMenu()
const router = useRouter()
const isTauriMode = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
function goSettings() { if (router.currentRoute.value.path !== '/settings') router.push('/settings') }

const terminalFocusMode = ref(false)
const focusAiPanelSnapshot = ref(false)

function persistTerminalFocusMode() {
  try { localStorage.setItem(TERMINAL_FOCUS_STORAGE_KEY, JSON.stringify({ enabled: terminalFocusMode.value })) } catch {}
}

function toggleTerminalFocusMode() {
  if (terminalFocusMode.value) {
    terminalFocusMode.value = false
    aiPanelCollapsed.value = focusAiPanelSnapshot.value
  } else {
    focusAiPanelSnapshot.value = aiPanelCollapsed.value
    terminalFocusMode.value = true
    aiPanelCollapsed.value = true
  }
  persistTerminalFocusMode()
  nextTick(() => window.dispatchEvent(new Event('aiterminal:layout-changed')))
}

provide('terminalFocusMode', terminalFocusMode)
provide('toggleTerminalFocusMode', toggleTerminalFocusMode)

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

const CMD_FAB_SIZE = 46
const CMD_FAB_MARGIN = 14
const CMD_FAB_POSITION_KEY = 'ai-command-fab-position'
const cmdFabPosition = reactive({ x: 0, y: 0 })
const cmdFabReady = ref(false)
const isCmdFabDragging = ref(false)
const cmdFabStyle = computed(() => ({ left: `${cmdFabPosition.x}px`, top: `${cmdFabPosition.y}px` }))
let cmdFabStartX = 0
let cmdFabStartY = 0
let cmdFabStartPosition = { x: 0, y: 0 }
let cmdFabDragged = false

function clampCmdFabPosition(x: number, y: number) {
  return {
    x: Math.max(CMD_FAB_MARGIN, Math.min(window.innerWidth - CMD_FAB_SIZE - CMD_FAB_MARGIN, x)),
    y: Math.max(CMD_FAB_MARGIN, Math.min(window.innerHeight - CMD_FAB_SIZE - CMD_FAB_MARGIN, y)),
  }
}

function saveCmdFabPosition() {
  try { localStorage.setItem(CMD_FAB_POSITION_KEY, JSON.stringify(cmdFabPosition)) } catch {}
}

function restoreCmdFabPosition() {
  const fallback = clampCmdFabPosition(window.innerWidth - CMD_FAB_SIZE - 22, window.innerHeight - CMD_FAB_SIZE - 22)
  try {
    const saved = JSON.parse(localStorage.getItem(CMD_FAB_POSITION_KEY) || 'null')
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) Object.assign(cmdFabPosition, clampCmdFabPosition(saved.x, saved.y))
    else Object.assign(cmdFabPosition, fallback)
  } catch { Object.assign(cmdFabPosition, fallback) }
  cmdFabReady.value = true
}

function onCmdFabPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  cmdFabStartX = e.clientX
  cmdFabStartY = e.clientY
  cmdFabStartPosition = { ...cmdFabPosition }
  cmdFabDragged = false
  isCmdFabDragging.value = true
  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  document.addEventListener('pointermove', onCmdFabPointerMove)
  document.addEventListener('pointerup', onCmdFabPointerUp)
  document.addEventListener('pointercancel', onCmdFabPointerUp)
  document.body.style.userSelect = 'none'
}

function onCmdFabPointerMove(e: PointerEvent) {
  const dx = e.clientX - cmdFabStartX
  const dy = e.clientY - cmdFabStartY
  if (Math.abs(dx) + Math.abs(dy) > 4) cmdFabDragged = true
  Object.assign(cmdFabPosition, clampCmdFabPosition(cmdFabStartPosition.x + dx, cmdFabStartPosition.y + dy))
}

function onCmdFabPointerUp() {
  isCmdFabDragging.value = false
  document.removeEventListener('pointermove', onCmdFabPointerMove)
  document.removeEventListener('pointerup', onCmdFabPointerUp)
  document.removeEventListener('pointercancel', onCmdFabPointerUp)
  document.body.style.userSelect = ''
  saveCmdFabPosition()
  if (cmdFabDragged) window.setTimeout(() => { cmdFabDragged = false }, 0)
}

function openCmdPaletteFromFab() {
  if (cmdFabDragged) return
  showCmdPalette.value = true
}

function onWindowResize() {
  Object.assign(cmdFabPosition, clampCmdFabPosition(cmdFabPosition.x, cmdFabPosition.y))
  saveCmdFabPosition()
}

onMounted(() => { register(hideCtx); document.addEventListener('click', hideCtx); document.addEventListener('keydown', onGlobalKey); restoreCmdFabPosition(); window.addEventListener('resize', onWindowResize) })
onUnmounted(() => { unregister(hideCtx); document.removeEventListener('click', hideCtx); document.removeEventListener('keydown', onGlobalKey); window.removeEventListener('resize', onWindowResize); onCmdFabPointerUp() })

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
provide('sendOperationsAnalysisToAI', async (title: string, content: string, prompt: string, serverInfo?: string): Promise<boolean> => {
  rightPanelTab.value = 'ai'
  if (aiPanelCollapsed.value) toggleAiPanel()
  await nextTick()
  return await aiChatRef.value?.injectOperationsAnalysis(title, content, prompt, serverInfo) || false
})
provide('sendScriptToAI', async (scriptName: string, content: string, prompt: string, scriptId?: string, mode: 'draft' | 'review' = 'draft'): Promise<boolean> => {
  rightPanelTab.value = 'ai'
  if (aiPanelCollapsed.value) toggleAiPanel()
  await nextTick()
  return await aiChatRef.value?.injectScriptContext(scriptName, content, prompt, scriptId, mode) || false
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

const isAiPanelResizing = ref(false)

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



function onAiPanelResizeStart(e: PointerEvent) {

  e.preventDefault()

  resizing = 'ai-panel'

  isAiPanelResizing.value = true

  resizeStartX = e.clientX

  resizeStartWidth = aiPanelWidth.value

  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)

  document.addEventListener('pointermove', onAiPanelResizeMove)

  document.addEventListener('pointerup', onAiPanelResizeEnd)

  document.body.style.cursor = 'col-resize'

  document.body.style.userSelect = 'none'

}



function onResizeMove(e: Pick<MouseEvent, 'clientX'>) {

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

function onAiPanelResizeMove(e: PointerEvent) {
  onResizeMove(e)
}

function onAiPanelResizeEnd() {
  isAiPanelResizing.value = false
  document.removeEventListener('pointermove', onAiPanelResizeMove)
  document.removeEventListener('pointerup', onAiPanelResizeEnd)
  onResizeEnd()
}

function resetAiPanelWidth() {
  aiPanelWidth.value = AI_PANEL_DEFAULT
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
  try {
    const saved = JSON.parse(localStorage.getItem(TERMINAL_FOCUS_STORAGE_KEY) || 'null')
    if (saved?.enabled === true) {
      terminalFocusMode.value = true
      aiPanelCollapsed.value = true
    }
  } catch {}
  await configStore.init()

})



onUnmounted(() => {

  document.removeEventListener('mousemove', onResizeMove)

  document.removeEventListener('mouseup', onResizeEnd)

  document.removeEventListener('pointermove', onAiPanelResizeMove)

  document.removeEventListener('pointerup', onAiPanelResizeEnd)

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
  position: relative;
}

.shell-aurora {
  position: fixed;
  pointer-events: none;
  z-index: 0;
  border-radius: 999px;
  filter: blur(42px);
  opacity: 0.54;
  mix-blend-mode: screen;
}

.shell-aurora-a {
  width: 360px;
  height: 360px;
  top: -160px;
  left: 18%;
  background: $shell-aurora-primary;
}

.shell-aurora-b {
  width: 420px;
  height: 420px;
  right: -140px;
  top: 8%;
  background: $shell-aurora-secondary;
}

// === 顶部品牌导航栏 ===
.app-topbar {
  height: 52px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 18px;
  background: linear-gradient(90deg, $color-bg-active, transparent 38%), $shell-topbar-bg;
  backdrop-filter: blur(16px) saturate(1.15);
  border-bottom: 1px solid $color-border;
  box-shadow: none;
  z-index: 10;
}
.tb-brand { display: flex; align-items: center; gap: 9px; }
.tb-logo { width: 30px; height: 30px; border-radius: 9px; box-shadow: $glow-soft; }
.tb-name { font-size: 16px; font-weight: 760; letter-spacing: -0.25px; color: $color-text-primary; font-family: 'Inter', sans-serif; }
.tb-badge {
  font-size: 9px; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase;
  color: $color-primary; background: $color-bg-active; padding: 3px 7px; border-radius: 999px;
  border: 1px solid $color-border-focus;
}
.tb-status-strip {
  display: flex; align-items: center; gap: 7px; margin-left: 12px;
  padding: 5px 10px; border: 1px solid $color-border-light; border-radius: 999px;
  background: $color-bg-input; color: $color-text-secondary; font-size: 10px;
}
.tb-status-strip span:not(.tb-status-dot) { padding: 0 2px; }
.tb-status-dot { width: 7px; height: 7px; border-radius: 50%; background: $color-success; box-shadow: 0 0 10px $color-success; }
.tb-spacer { flex: 1; }
.tb-cmd {
  display: flex; align-items: center; gap: 8px;
  height: 34px; min-width: 240px; padding: 0 10px; border: 1px solid $color-border;
  border-radius: 999px; background: $color-bg-input; cursor: pointer;
  color: $color-text-regular; font-family: inherit; font-size: $font-size-xs;
  transition: all $transition-fast;
  &:hover { border-color: $color-primary; color: $color-text-primary; box-shadow: $glow-primary; }
  .tb-kbd { font-family: $font-family-mono; font-size: 10px; color: $color-primary; background: $color-bg-active; padding: 2px 6px; border-radius: 999px; border: 1px solid $color-border; }
}
.tb-icon-btn {
  width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
  border: none; border-radius: $border-radius-md; background: transparent; cursor: pointer;
  color: $color-text-regular; transition: all $transition-fast;
  &:hover { background: $color-bg-hover; color: $color-primary; box-shadow: $glow-soft; }
}

.main-layout {

  display: flex;

  flex: 1;

  width: 100%;

  min-height: 0;

  overflow: hidden;
  position: relative;
  z-index: 1;

}



// === 左侧菜单栏 ===

.sidebar {

  height: 100%;

  background: $shell-sidebar-bg;

  backdrop-filter: blur(10px) saturate(1.1);

  -webkit-backdrop-filter: blur(10px) saturate(1.1);

  border-right: 1px solid $color-border;
  box-shadow: none;

  flex-shrink: 0;

  display: flex;

  flex-direction: column;

  overflow: hidden;

}



// === 拖拽条 ===

.resize-bar {

  width: 8px;

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

.ai-resize-bar {
  width: 10px;
  touch-action: none;
  background: transparent;

  &::after {
    width: 2px;
    border-radius: 999px;
    background-color: $color-border;
  }

  &:hover,
  &.dragging {
    background: $color-bg-hover;

    &::after {
      width: 3px;
      background-color: $color-primary;
      box-shadow: $glow-soft;
    }
  }
}



// === 中间工作区 ===

.workspace {

  flex: 1;

  min-width: 200px;

  overflow: hidden;

  display: flex;

  flex-direction: column;

  position: relative;

  background:
    radial-gradient(circle at 50% 0%, $shell-aurora-primary, transparent 36%),
    $shell-workspace-bg;

}



// === 右侧AI面板 — 纵向布局，顶部栏+内容区填满 ===

.ai-panel {

  height: 100%;

  background: $shell-ai-bg;

  backdrop-filter: blur(10px) saturate(1.1);

  -webkit-backdrop-filter: blur(10px) saturate(1.1);

  border-left: 1px solid $color-border;
  box-shadow: none;

  flex-shrink: 0;

  display: flex;

  flex-direction: column;

  overflow: hidden;

}



// 顶部栏：横向排列 toggle + 标题，填满宽度

.ai-top-bar {

  height: 40px;

  display: flex;

  align-items: center;

  flex-shrink: 0;

  border-bottom: 1px solid $color-border;
  background: $color-bg-surface;

  padding: 0 10px;

  gap: 6px;

}



// toggle按钮 — 小箭头，无背景

.ai-toggle-btn {

  width: 26px;

  height: 26px;

  display: flex;

  align-items: center;

  justify-content: center;

  cursor: pointer;

  color: $color-text-regular;

  border-radius: 7px;

  transition: color 0.15s ease, background 0.15s ease;

  flex-shrink: 0;



  &:hover {

    color: $color-primary;
    background: $color-bg-hover;

  }

}



// 标签页切换

.right-tabs {

  display: flex;

  gap: 4px;

  flex: 1;

  overflow: hidden;

}

.ai-panel-close {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: none;
  border-radius: 7px;
  color: $color-text-regular;
  background: transparent;
  cursor: pointer;
  transition: color $transition-fast, background $transition-fast;

  &:hover { color: $color-text-primary; background: $color-bg-hover; }
}



.right-tab {

  padding: 5px 10px;

  border: 1px solid transparent;

  border-radius: 7px;

  cursor: pointer;

  font-size: $font-size-xs;

  font-weight: 500;

  color: $color-text-regular;

  background: transparent;

  transition: all $transition-fast;

  white-space: nowrap;

  font-family: inherit;



  &:hover {

    color: $color-text-primary;

    background-color: $color-bg-hover;

  }



  &.active {

    color: $color-primary;

    background: $color-bg-active;
    border-color: $color-border-light;

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
  z-index: 30;
  width: 46px;
  height: 46px;
  border: 1px solid $color-border-focus;
  border-radius: 50%;
  cursor: grab;
  color: $color-on-primary;
  background: $gradient-primary;
  box-shadow: $elevation-1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, box-shadow 0.18s ease, left 0.08s linear, top 0.08s linear;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
  overflow: visible;

  &:hover {
    transform: translateY(-2px) scale(1.05);
    box-shadow: $elevation-2;
  }
  &:active { transform: scale(0.96); }

  &.dragging {
    cursor: grabbing;
    transition: none;
    transform: scale(1.03);
  }

}

.cmd-fab-ring {
  position: absolute;
  inset: -7px;
  border-radius: 50%;
  border: 1px solid $color-border-focus;
  box-shadow: none;
  animation: none;
}

.tb-focus-btn {
  height: 28px;
  border: 1px solid $color-border;
  border-radius: $border-radius-sm;
  padding: 0 9px;
  color: $color-text-secondary;
  background: $color-bg-active;
  cursor: pointer;
  font-size: $font-size-xs;

  &:hover { color: $color-primary; border-color: $color-primary; }
}

@keyframes pulse-neon-ring {
  0%, 100% { transform: scale(0.94); opacity: 0.55; }
  50% { transform: scale(1.08); opacity: 0.95; }
}

</style>
