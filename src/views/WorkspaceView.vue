/**
 * 服务器连接工作区 — 中间主区域
 * 对齐SSH_MODULE_SPEC.md：
 * 服务器列表(可拖拽伸缩120~400px，默认200px) + 终端面板flex:1
 * 顶部标签栏40px + 底部状态栏24px
 * 分组过滤 + 搜索 + 快捷命令 + cd→SFTP同步
 * Termius极简风格
 */
<template>
  <div class="workspace-view">
    <!-- 顶部标签栏 40px -->
    <div class="tab-bar">
      <div class="tab-item hosts-tab" :class="{ active: !sshStore.activeSessionId }" @click="sshStore.activeSessionId = ''">
        <el-icon :size="14"><Monitor /></el-icon>
        <span>Hosts</span>
      </div>
      <div v-for="session in sshStore.sessions" :key="session.id" class="tab-item" :class="{ active: session.id === sshStore.activeSessionId }" @click="sshStore.switchSession(session.id)">
        <span class="tab-status" :class="session.status"></span>
        <span class="tab-name">{{ session.serverName }}</span>
        <el-icon class="tab-close" :size="12" @click.stop="handleCloseSession(session.id)"><Close /></el-icon>
      </div>
      <div class="tab-item add-tab" @click="handleNewConnection" title="New Host">
        <el-icon :size="14"><Plus /></el-icon>
      </div>
      <!-- File tabs (Xterminal style) — multi-tab -->
      <div v-for="(file, idx) in sshStore.openFiles" :key="file.path" class="tab-item" :class="{ active: sshStore.activeFileIndex === idx }" @click="sshStore.activeFileIndex = idx">
        <el-icon :size="12"><Document /></el-icon>
        <span class="tab-name">{{ file.name }}</span>
        <span v-if="file.loading" class="tab-loading">...</span>
        <el-icon class="tab-close" :size="12" @click.stop="sshStore.openFiles.splice(idx, 1); if (sshStore.activeFileIndex >= sshStore.openFiles.length) sshStore.activeFileIndex = sshStore.openFiles.length - 1"><Close /></el-icon>
      </div>
    </div>

    <!-- 内容区：分栏布局 -->
    <div class="workspace-content">
      <!-- 左侧面板 -->
      <div class="host-list-panel" :style="{ width: hostListWidth + 'px' }">
        <template v-if="leftPanelMode === 'hosts'">
          <div class="host-list-top">
            <div class="group-filter">
              <span class="group-tag" :class="{ active: !sshStore.selectedGroupId }" @click="sshStore.selectedGroupId = ''">All</span>
              <span v-for="group in sshStore.groups" :key="group.id" class="group-tag" :class="{ active: sshStore.selectedGroupId === group.id }" @click="sshStore.selectedGroupId = group.id">{{ group.name }}</span>
            </div>
            <el-input v-model="sshStore.searchQuery" size="small" placeholder="Search hosts..." clearable class="search-input">
              <template #prefix><el-icon><Search /></el-icon></template>
            </el-input>
          </div>
          <div class="host-list">
            <div v-for="server in sshStore.filteredServers" :key="server.id" class="host-item" :class="{ active: selectedServerId === server.id }" @click="selectedServerId = server.id" @dblclick="handleConnect(server.id)" @contextmenu.prevent="showHostMenu($event, server)">
              <span class="host-status" :class="getServerStatus(server.id)"></span>
              <div class="host-info">
                <span class="host-name">{{ server.name }}</span>
                <span class="host-addr">{{ server.host }}</span>
              </div>
            </div>
            <div v-if="sshStore.filteredServers.length === 0" class="empty-hosts">
              <p>{{ sshStore.servers.length === 0 ? 'No hosts' : 'No matching hosts' }}</p>
            </div>
          </div>
          <div class="host-list-footer">
            <el-button size="small" type="primary" class="new-host-btn" @click="handleNewConnection">
              <el-icon><Plus /></el-icon>New Host
            </el-button>
          </div>
        </template>

        <template v-else>
          <div class="sftp-panel">
            <div class="sftp-header">
              <span class="sftp-title">{{ sshStore.activeSession?.serverName }}</span>
              <el-button text size="small" @click="leftPanelMode = 'hosts'" title="Back to hosts">
                <el-icon><ArrowLeft /></el-icon>
              </el-button>
            </div>
            <SftpTree />
          </div>
        </template>
      </div>

      <div class="resize-bar-hostlist" @mousedown="onHostListResizeStart" />

      <div class="terminal-area">
        <!-- File viewer + Terminal split layout (Xterminal style) -->
        <template v-if="sshStore.activeSession">
          <!-- File viewer top section -->
          <div v-if="sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex]" class="fv-section" :style="{ height: fileViewerHeight + 'px' }">
            <div class="fv-toolbar">
              <span class="fv-title">{{ sshStore.openFiles[sshStore.activeFileIndex].name }}</span>
              <span class="fv-path">{{ sshStore.openFiles[sshStore.activeFileIndex].path }}</span>
              <div class="fv-actions">
                <el-button size="small" text @click="sshStore.activeFileIndex = -1" title="Close files">
                  <el-icon><Close /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="fv-body">
              <pre class="fv-content" v-html="highlightedContent"></pre>
            </div>
          </div>
          <!-- Resize handle between file viewer and terminal -->
          <div v-if="sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex]" class="split-handle" @mousedown="onSplitResizeStart"></div>
          <!-- Terminal bottom section -->
          <div class="term-section" :class="{ 'has-files': sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex] }">
            <QuickCommands />
            <TerminalPanel :session="sshStore.activeSession" @cwd-change="onCwdChange" />
          </div>
        </template>
        <template v-else>
          <div class="terminal-empty">
            <el-icon :size="36" class="empty-icon"><SetUp /></el-icon>
            <p>Select a host and connect</p>
            <p class="sub">Double-click a host or use the connect button</p>
          </div>
        </template>
      </div>
    </div>

    <footer class="status-bar">
      <span class="status-item">
        <span class="status-dot" :class="{ online: modelStore.defaultConfig }"></span>
        {{ modelStore.defaultConfig ? 'AI Ready' : 'AI N/A' }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">{{ sshStore.sessions.length }} session(s)</span>
      <span class="status-sep">|</span>
      <span class="status-item" v-if="sshStore.activeSession">
        {{ sshStore.activeSession.serverName }} -
        <span :class="'status-text-' + sshStore.activeSession.status">{{ sshStore.activeSession.status }}</span>
      </span>
      <span class="status-sep" v-if="sshStore.activeSession">|</span>
      <span class="status-item">v0.1.0</span>
    </footer>

    <SshConnectDialog />

    <!-- 服务器右键菜单 -->
    <teleport to="body">
      <div v-if="hostMenu.visible" class="host-context-menu" :style="{ left: hostMenu.x + 'px', top: hostMenu.y + 'px' }">
        <div class="hmenu-item" @click="hostMenuAction('connect')"><el-icon :size="13"><SetUp /></el-icon><span>Connect</span></div>
        <div class="hmenu-item" @click="hostMenuAction('edit')"><el-icon :size="13"><Edit /></el-icon><span>Edit</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item" @click="hostMenuAction('copyAddr')"><el-icon :size="13"><CopyDocument /></el-icon><span>Copy Address</span></div>
        <div class="hmenu-item" @click="hostMenuAction('copyName')"><el-icon :size="13"><Link /></el-icon><span>Copy Name</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item danger" @click="hostMenuAction('delete')"><el-icon :size="13"><Delete /></el-icon><span>Delete</span></div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { useConfigStore } from '@/stores/config'
import { highlightCode } from '@/utils/highlight'
import { useModelStore } from '@/stores/model'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Close, SetUp, ArrowLeft, Search, Edit, Delete, CopyDocument, Link, Document } from '@element-plus/icons-vue'
import TerminalPanel from '@/components/TerminalPanel.vue'
import SshConnectDialog from '@/components/SshConnectDialog.vue'
import SftpTree from '@/components/SftpTree.vue'
import QuickCommands from '@/components/QuickCommands.vue'

const sshStore = useSshStore()
const modelStore = useModelStore()
const configStore = useConfigStore()

const highlightedContent = computed(() => {
  const f = sshStore.openFiles[sshStore.activeFileIndex]
  if (!f) return ''
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  return highlightCode(f.content, ext)
})

const selectedServerId = ref('')

// 服务器右键菜单状态
const hostMenu = reactive({ visible: false, x: 0, y: 0, server: null as any })

function showHostMenu(e: MouseEvent, server: any) {
  hostMenu.server = server
  hostMenu.x = e.clientX
  hostMenu.y = e.clientY
  hostMenu.visible = true
  setTimeout(() => {
    document.addEventListener('click', () => { hostMenu.visible = false }, { once: true })
  }, 10)
}

function hostMenuAction(action: string) {
  const server = hostMenu.server
  hostMenu.visible = false
  if (!server) return
  switch (action) {
    case 'connect': handleConnect(server.id); break
    case 'edit':
      sshStore.editingServer = { ...server }
      sshStore.showConnectDialog = true
      break
    case 'delete':
      ElMessageBox.confirm(`Delete "${server.name}"?`, 'Confirm', { type: 'warning', confirmButtonText: 'Delete', cancelButtonText: 'Cancel' }).then(() => {
        sshStore.deleteServer(server.id)
        ElMessage.success('Server deleted')
      }).catch(() => {})
      break
    case 'copyAddr':
      navigator.clipboard.writeText(`${server.host}:${server.port}`)
      ElMessage.success('Address copied')
      break
    case 'copyName':
      navigator.clipboard.writeText(server.name)
      ElMessage.success('Name copied')
      break
  }
}

// Terminal cd -> SFTP path sync ref (SftpTree watches this)
const terminalTargetPath = ref('')
provide('terminalTargetPath', terminalTargetPath)

// Quick command execution ref (TerminalPanel watches this)
const quickCommandToExecute = ref('')
provide('quickCommandToExecute', quickCommandToExecute)
provide('injectQuickCommand', (cmd: string) => {
  quickCommandToExecute.value = cmd
})

provide('refreshSftpTree', () => {})

/** Handle cd command from terminal - sync SFTP tree */
function onCwdChange(path: string) {
  if (leftPanelMode.value !== 'sftp') {
    leftPanelMode.value = 'sftp'
  }
  if (path && path !== '/') {
    terminalTargetPath.value = path
  }
}

const leftPanelMode = ref<'hosts' | 'sftp'>('hosts')

watch(() => sshStore.activeSession?.status, (status) => {
  if (status === 'connected') {
    leftPanelMode.value = 'sftp'
  } else if (!status || status === 'disconnected') {
    leftPanelMode.value = 'hosts'
  }
})

// === 服务器列表伸缩 ===
const HOST_LIST_MIN = 120
const HOST_LIST_MAX = 400
const HOST_LIST_DEFAULT = 200
const hostListWidth = ref(HOST_LIST_DEFAULT)
let hostListResizing = false
let hostListStartX = 0
let hostListStartWidth = 0

function onHostListResizeStart(e: MouseEvent) {
  e.preventDefault()
  hostListResizing = true
  hostListStartX = e.clientX
  hostListStartWidth = hostListWidth.value
  document.addEventListener('mousemove', onHostListResizeMove)
  document.addEventListener('mouseup', onHostListResizeEnd)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onHostListResizeMove(e: MouseEvent) {
  if (!hostListResizing) return
  const delta = e.clientX - hostListStartX
  hostListWidth.value = Math.max(HOST_LIST_MIN, Math.min(HOST_LIST_MAX, hostListStartWidth + delta))
}

function onHostListResizeEnd() {
  hostListResizing = false
  document.removeEventListener('mousemove', onHostListResizeMove)
  document.removeEventListener('mouseup', onHostListResizeEnd)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}

// Split resize for file viewer vs terminal
const fileViewerHeight = ref(250)
let splitResizing = false; let splitStartY = 0; let splitStartH = 0

function onSplitResizeStart(e: MouseEvent) {
  e.preventDefault(); splitResizing = true
  splitStartY = e.clientY; splitStartH = fileViewerHeight.value
  document.addEventListener('mousemove', onSplitResizeMove)
  document.addEventListener('mouseup', onSplitResizeEnd)
  document.body.style.cursor = 'row-resize'; document.body.style.userSelect = 'none'
}

function onSplitResizeMove(e: MouseEvent) {
  if (!splitResizing) return
  const delta = e.clientY - splitStartY
  const el = document.querySelector('.terminal-area') as HTMLElement
  const maxH = (el?.clientHeight || 600) - 150
  fileViewerHeight.value = Math.max(100, Math.min(maxH, splitStartH + delta))
}

function onSplitResizeEnd() {
  splitResizing = false
  document.removeEventListener('mousemove', onSplitResizeMove)
  document.removeEventListener('mouseup', onSplitResizeEnd)
  document.body.style.cursor = ''; document.body.style.userSelect = ''
}

function getServerStatus(serverId: string): string {
  const session = sshStore.sessions.find(s => s.serverId === serverId)
  return session?.status || 'disconnected'
}

function handleNewConnection() {
  sshStore.editingServer = null
  sshStore.showConnectDialog = true
}

async function handleConnect(serverId: string) {
  const server = sshStore.servers.find(s => s.id === serverId)
  if (!server) return
  try {
    const session = sshStore.createSession(serverId)
    sshStore.updateSessionStatus(session.id, 'connecting')

    // Try real Rust SSH backend
    try {
      const { sshConnect } = await import('@/api/tauri')
      const result = await sshConnect({
        host: server.host,
        port: server.port,
        username: server.username,
        auth: server.authType === 'password'
          ? { type: 'password', password: server.password || '' }
          : { type: 'private_key', key_path: server.keyPath || '' },
        timeout_ms: 10000,
        remark: '',
        pinned: false,
      })
      // Store real session_id on the frontend session
      session.realSessionId = result.session_id
      sshStore.updateSessionStatus(session.id, 'connected')
    } catch (e: any) {
      // Fallback: demo mode (no real SSH backend available yet)
      console.warn('Real SSH connect failed, using demo:', e?.message || e)
      setTimeout(() => {
        sshStore.updateSessionStatus(session.id, 'connected')
      }, 800)
    }
  } catch {
    // error handled in store
  }
}

async function handleCloseSession(sessionId: string) {
  const session = sshStore.sessions.find(s => s.id === sessionId)
  if (session?.realSessionId) {
    try {
      const { sshDisconnect } = await import('@/api/tauri')
      await sshDisconnect(session.realSessionId)
    } catch (e) {
      console.warn('Disconnect error:', e)
    }
  }
  sshStore.closeSession(sessionId)
}

onMounted(() => {
  sshStore.init()
})

onUnmounted(() => {
  document.removeEventListener('mousemove', onHostListResizeMove)
  document.removeEventListener('mouseup', onHostListResizeEnd)
})
</script>

<style lang="scss" scoped>
.workspace-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.tab-bar { height: 40px; display: flex; align-items: center; padding: 0 $spacing-xs; background-color: $color-bg-surface; border-bottom: 1px solid $color-border-light; flex-shrink: 0; gap: 2px; overflow-x: auto; }

.tab-item { display: flex; align-items: center; gap: 5px; padding: 0 12px; height: 32px; border-radius: $border-radius-sm; cursor: pointer; color: $color-text-secondary; font-size: $font-size-sm; white-space: nowrap; transition: all $transition-fast; position: relative;
  &:hover { background-color: $color-bg-hover; color: $color-text-regular; }
  &.active { color: $color-text-primary; background-color: $color-bg-active;
    &::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 16px; height: 2px; background-color: $color-primary; border-radius: 1px 1px 0 0; }
  }
}

.hosts-tab { font-weight: 600; }
.add-tab { width: 32px; justify-content: center; padding: 0; }

.tab-status { width: 6px; height: 6px; border-radius: 50%; background-color: $color-text-muted; flex-shrink: 0;
  &.connecting { background-color: $color-warning; } &.connected { background-color: $color-success; } &.disconnected { background-color: $color-text-muted; } &.error { background-color: $color-danger; } &.reconnecting { background-color: $color-warning; animation: pulse 1s infinite; }
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.tab-close { margin-left: 2px; color: $color-text-muted; &:hover { color: $color-danger; } }

.workspace-content { flex: 1; overflow: hidden; display: flex; }

.host-list-panel { border-right: 1px solid $color-border-light; display: flex; flex-direction: column; flex-shrink: 0; background-color: $color-bg-primary; overflow: hidden; }

.host-list-top { flex-shrink: 0; padding: $spacing-xs $spacing-sm; border-bottom: 1px solid $color-border-light; display: flex; flex-direction: column; gap: $spacing-xs; }

.group-filter { display: flex; gap: 4px; flex-wrap: wrap; }

.group-tag { font-size: $font-size-xs; padding: 2px 8px; border-radius: $border-radius-sm; cursor: pointer; color: $color-text-secondary; background-color: transparent; border: 1px solid transparent; transition: all $transition-fast; white-space: nowrap;
  &:hover { color: $color-text-primary; background-color: $color-bg-hover; border-color: $color-border; }
  &.active { color: $color-primary; background-color: rgba(91, 141, 239, 0.12); border-color: $color-primary; }
}

.search-input { :deep(.el-input__wrapper) { background-color: $color-bg-input !important; height: 26px; } }

.resize-bar-hostlist { width: 5px; flex-shrink: 0; cursor: col-resize; position: relative; z-index: 2;
  &::after { content: ''; position: absolute; top: 0; bottom: 0; left: 50%; transform: translateX(-50%); width: 1px; background-color: transparent; transition: background-color 0.15s ease; }
  &:hover::after { background-color: $color-primary; }
}

.host-list { flex: 1; overflow-y: auto; padding: $spacing-xs 0; }

.host-item { display: flex; align-items: center; gap: $spacing-sm; padding: 0 $spacing-md; height: 48px; cursor: pointer; transition: background-color $transition-fast; position: relative;
  &:hover { background-color: $color-bg-hover; }
  &.active { background-color: $color-bg-active;
    &::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background-color: $color-primary; border-radius: 0 1px 1px 0; }
  }
}

.host-status { width: 6px; height: 6px; border-radius: 50%; background-color: $color-text-muted; flex-shrink: 0;
  &.connecting { background-color: $color-warning; } &.connected { background-color: $color-success; } &.disconnected { background-color: $color-text-muted; } &.error { background-color: $color-danger; } }

.host-info { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.host-name { font-size: $font-size-md; color: $color-text-primary; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.host-addr { font-size: $font-size-xs; color: $color-text-secondary; font-family: $font-family-mono; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.empty-hosts { flex: 1; display: flex; align-items: center; justify-content: center; color: $color-text-placeholder; font-size: $font-size-sm; }
.host-list-footer { padding: $spacing-sm $spacing-md; border-top: 1px solid $color-border-light; }
.new-host-btn { width: 100%; }

.sftp-panel { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.sftp-header { display: flex; align-items: center; justify-content: space-between; padding: $spacing-xs $spacing-sm; border-bottom: 1px solid $color-border-light; flex-shrink: 0;
  .sftp-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; }
}

.terminal-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; background-color: #0d0d1a; }

.terminal-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: $spacing-sm; color: $color-text-secondary;
  .empty-icon { color: $color-text-muted; opacity: 0.3; } p { font-size: $font-size-md; } .sub { font-size: $font-size-sm; color: $color-text-placeholder; }
}

.status-bar { height: $status-bar-height; background-color: $color-bg-surface; border-top: 1px solid $color-border-light; display: flex; align-items: center; padding: 0 $spacing-md; gap: $spacing-sm; flex-shrink: 0; font-size: $font-size-xs; color: $color-text-secondary; font-family: $font-family-mono;
  .status-item { display: flex; align-items: center; gap: 4px; } .status-sep { color: $color-text-muted; }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; background-color: $color-danger; &.online { background-color: $color-success; } }
  .status-text-connected { color: $color-success; } .status-text-connecting { color: $color-warning; } .status-text-disconnected { color: $color-text-muted; } .status-text-error { color: $color-danger; } .status-text-reconnecting { color: $color-warning; }
}

// 服务器右键菜单
.host-context-menu {
  position: fixed; z-index: 9999;
  background-color: $color-bg-toolbar;
  border: 1px solid $color-border;
  border-radius: $border-radius-md;
  padding: $spacing-xs 0;
  min-width: 160px;
  box-shadow: $shadow-lg;
}

.hmenu-item {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px; cursor: pointer;
  color: $color-text-regular; font-size: $font-size-sm;
  transition: all $transition-fast;

  &:hover { background-color: $color-bg-hover; color: $color-text-primary; }
  &.danger { color: $color-danger; &:hover { background-color: rgba(212, 84, 84, 0.1); } }
}

.hmenu-sep {
  height: 1px; background-color: $color-border-light;
  margin: $spacing-xs 0;
}

// File viewer (Xterminal style)
.file-viewer {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background-color: #0d0d1a;
}

.fv-toolbar {
  display: flex; align-items: center; gap: $spacing-sm;
  padding: 0 $spacing-sm; height: 32px; flex-shrink: 0;
  background-color: $color-bg-surface; border-bottom: 1px solid $color-border-light;
}

.fv-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; }
.fv-path { font-size: $font-size-xs; color: $color-text-placeholder; font-family: $font-family-mono; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fv-actions { display: flex; gap: 2px; }

.fv-content {
  flex: 1; margin: 0; padding: $spacing-md; overflow: auto;
  font-family: $font-family-mono; font-size: $font-size-sm; line-height: 1.5;
  color: #e8e8f0; white-space: pre; user-select: text;
  -webkit-user-select: text;
}

.tab-loading { font-size: 10px; color: $color-text-muted; animation: pulse 1s infinite; }

// File viewer + terminal split layout
.fv-section {
  display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
  background-color: #0d0d1a; border-bottom: 1px solid $color-border-light;
}

.fv-toolbar {
  display: flex; align-items: center; gap: $spacing-sm;
  padding: 0 $spacing-sm; height: 30px; flex-shrink: 0;
  background-color: $color-bg-surface; border-bottom: 1px solid $color-border-light;
}

.fv-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; white-space: nowrap; }
.fv-path { font-size: $font-size-xs; color: $color-text-placeholder; font-family: $font-family-mono; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin: 0 $spacing-sm; }
.fv-actions { display: flex; gap: 2px; flex-shrink: 0; }

.fv-body { flex: 1; overflow: hidden; }
.fv-content {
  margin: 0; padding: $spacing-sm $spacing-md; height: 100%; overflow: auto;
  font-family: $font-family-mono; font-size: $font-size-sm; line-height: 1.5;
  color: #e8e8f0; white-space: pre; user-select: text; -webkit-user-select: text;
}

.split-handle {
  height: 4px; flex-shrink: 0; cursor: row-resize; position: relative; z-index: 3;
  background-color: transparent; transition: background-color 0.15s;
  &::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 30px; height: 2px; background-color: $color-border; border-radius: 1px; }
  &:hover::after { background-color: $color-primary; }
}

.term-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 100px; }
.tab-loading { font-size: 10px; color: $color-text-muted; animation: pulse 1s infinite; }
</style>
