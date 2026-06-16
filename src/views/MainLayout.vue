/**

 * 主布局 — Termius极简三栏可伸缩布局

 * 左侧菜单栏：可拖拽伸缩（48~200px，默认56px）

 * 右侧AI面板：可拖拽伸缩（200~600px，默认320px），可收起

 * 中间服务器区：flex:1 自适应

 */

<template>

  <div class="main-layout" @contextmenu.self.prevent="onPageCtx">

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

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>
  </div>

</template>



<script setup lang="ts">

import { ref, reactive, onMounted, onUnmounted, provide } from 'vue'

import { useConfigStore } from '@/stores/config'
import { useLocale } from '@/composables/useLocale'

import { DArrowLeft, DArrowRight, Refresh } from '@element-plus/icons-vue'

import SideNav from '@/components/SideNav.vue'

import AiChat from '@/components/AiChat.vue'

import SystemMonitor from '@/components/SystemMonitor.vue'
import { useContextMenu } from '@/composables/useContextMenu'



const configStore = useConfigStore()
const { t } = useLocale()
const { register, unregister } = useContextMenu()

// 右键菜单
const ctx = reactive({ visible: false, x: 0, y: 0 })
function onPageCtx(e: MouseEvent) { ctx.x = e.clientX; ctx.y = e.clientY; ctx.visible = true }
function hideCtx() { ctx.visible = false }
function ctxAct(action: string) { hideCtx(); if (action === 'refresh') location.reload() }
onMounted(() => { register(hideCtx); document.addEventListener('click', hideCtx) })
onUnmounted(() => { unregister(hideCtx); document.removeEventListener('click', hideCtx) })

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

.main-layout {

  display: flex;

  width: 100%;

  height: 100%;

  overflow: hidden;

  background-color: $color-bg-app;

}



// === 左侧菜单栏 ===

.sidebar {

  height: 100%;

  background-color: $color-bg-sidebar;

  border-right: 1px solid $color-border-light;

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

  background-color: $color-bg-panel;

  border-left: 1px solid $color-border-light;

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

</style>

