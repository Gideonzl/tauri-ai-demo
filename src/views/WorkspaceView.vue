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
        <span>{{ t('workspace.hosts') }}</span>
      </div>
      <div v-for="session in sshStore.sessions" :key="session.id" class="tab-item" :class="{ active: session.id === sshStore.activeSessionId }" @click="sshStore.switchSession(session.id)">
        <span class="tab-status" :class="session.status"></span>
        <span class="tab-name">{{ session.serverName }}</span>
        <el-icon class="tab-close" :size="12" @click.stop="handleCloseSession(session.id)"><Close /></el-icon>
      </div>
      <div class="tab-item add-tab" @click="handleNewConnection" :title="t('workspace.newHost')">
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
            <el-input v-model="sshStore.searchQuery" size="small"  :placeholder="t('workspace.searchHosts')" clearable class="search-input">
              <template #prefix><el-icon :size="14"><Search /></el-icon></template>
            </el-input>
          </div>
          <div class="host-list">
            <!-- Grouped host list (Termius style) -->
            <template v-for="group in groupedHosts" :key="group.name">
              <div class="host-group" v-if="group.hosts.length > 0">
                <div class="group-header" @click="toggleGroup(group.name)">
                  <el-icon :size="12" class="group-chevron" :class="{ expanded: !collapsedGroups.has(group.name) }">
                    <ArrowRight />
                  </el-icon>
                  <span class="group-name">{{ group.name }}</span>
                  <span class="group-count">{{ group.onlineCount }}/{{ group.hosts.length }}</span>
                </div>
                <div v-if="!collapsedGroups.has(group.name)" class="group-hosts">
                  <div
                    v-for="server in group.hosts"
                    :key="server.id"
                    class="host-item"
                    :class="{ active: selectedServerId === server.id }"
                    @click="selectedServerId = server.id"
                    @dblclick="handleConnect(server.id)"
                    @contextmenu.prevent="showHostMenu($event, server)"
                  >
                    <span class="host-status" :class="getServerStatus(server.id)"></span>
                    <div class="host-info">
                      <span class="host-name">{{ server.name }}</span>
                      <span class="host-addr">{{ server.username }}@{{ server.host }}:{{ server.port }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
            <!-- Empty state -->
            <div v-if="sshStore.filteredServers.length === 0" class="empty-hosts">
              <el-icon :size="28" class="empty-icon"><SetUp /></el-icon>
              <p>{{ sshStore.servers.length === 0 ? t('workspace.noHosts') : t('workspace.noMatching') }}</p>
              <p class="sub">{{ t('workspace.addHostHint') }}</p>
            </div>
          </div>
          <div class="host-list-footer">
            <el-button size="small" class="new-host-btn" @click="handleNewConnection">
              <el-icon :size="14"><Plus /></el-icon>{{ t('workspace.newHost') }}
            </el-button>
          </div>
        </template>

        <template v-else>
          <div class="sftp-panel">
            <div class="sftp-header">
              <span class="sftp-title">{{ sshStore.activeSession?.serverName }}</span>
              <el-button text size="small" @click="leftPanelMode = 'hosts'"  :title="t('workspace.backToHosts')">
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
                <el-button size="small" text @click="sshStore.activeFileIndex = -1"  :title="t('workspace.closeFiles')">
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
            <p>{{ t('workspace.selectHost') }}</p>
            <p class="sub">{{ t('workspace.selectHostHint') }}</p>
          </div>
        </template>
      </div>
    </div>

    <footer class="status-bar">
      <span class="status-item" :style="{ color: isTauriMode ? '#4caf7d' : '#d4a24e', fontWeight: 600 }">
        <span class="status-dot" :style="{ background: isTauriMode ? '#4caf7d' : '#d4a24e' }"></span>
        {{ isTauriMode ? 'TAURI' : t('workspace.demo') }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item" v-if="sshStore.activeSession">
        {{ sshStore.activeSession.serverName }}
        <span v-if="sshStore.activeSession.realSessionId" style="color:#4caf7d;font-weight:600"> {{ t('workspace.real') }}</span>
        <span v-else style="color:#d4a24e"> {{ t('workspace.demo') }}</span>
        -
        <span :class="'status-text-' + sshStore.activeSession.status">{{ sshStore.activeSession.status }}</span>
      </span>
      <span class="status-sep" v-if="sshStore.activeSession">|</span>
      <span class="status-item">
        <span class="status-dot" :class="{ online: modelStore.defaultConfig }"></span>
        {{ modelStore.defaultConfig ? t('ai.ready') : t('ai.na') }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">v0.1.0</span>
    </footer>

    <SshConnectDialog />
    <PortForwarding ref="portForwardingRef" />
    <KeyManager ref="keyManagerRef" />
    <HostImportExport ref="hostImportExportRef" />

    <!-- 服务器右键菜单 -->
    <teleport to="body">
      <div v-if="hostMenu.visible" class="host-context-menu" :style="{ left: hostMenu.x + 'px', top: hostMenu.y + 'px' }">
        <div class="hmenu-item" @click="hostMenuAction('connect')"><el-icon :size="13"><SetUp /></el-icon><span>{{ t('workspace.connect') }}</span></div>
        <div class="hmenu-item" @click="hostMenuAction('edit')"><el-icon :size="13"><Edit /></el-icon><span>{{ t('workspace.edit') }}</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item" @click="hostMenuAction('copyAddr')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('workspace.copyAddress') }}</span></div>
        <div class="hmenu-item" @click="hostMenuAction('copyName')"><el-icon :size="13"><Link /></el-icon><span>{{ t('workspace.copyName') }}</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item" @click="hostMenuAction('portForwarding')"><el-icon :size="13"><Connection /></el-icon><span>{{ t('workspace.portForwarding') }}</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item" @click="hostMenuAction('keyManager')"><el-icon :size="13"><Key /></el-icon><span>{{ t('workspace.keyManager') }}</span></div>
        <div class="hmenu-item" @click="hostMenuAction('importExport')"><el-icon :size="13"><Upload /></el-icon><span>{{ t('workspace.importExport') }}</span></div>
        <div class="hmenu-sep"></div>
        <div class="hmenu-item danger" @click="hostMenuAction('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('workspace.delete') }}</span></div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, provide, watch } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { useConfigStore } from '@/stores/config'
import { useLocale } from '@/composables/useLocale'
import { highlightCode } from '@/utils/highlight'
import { useModelStore } from '@/stores/model'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Close, SetUp, ArrowLeft, ArrowRight, Search, Edit, Delete, CopyDocument, Link, Document, Connection, Key, Upload } from '@element-plus/icons-vue'
import TerminalPanel from '@/components/TerminalPanel.vue'
import SshConnectDialog from '@/components/SshConnectDialog.vue'
import SftpTree from '@/components/SftpTree.vue'
import QuickCommands from '@/components/QuickCommands.vue'
import PortForwarding from '@/components/PortForwarding.vue'
import KeyManager from '@/components/KeyManager.vue'
import HostImportExport from '@/components/HostImportExport.vue'

const sshStore = useSshStore()
const modelStore = useModelStore()
const { t } = useLocale()
const configStore = useConfigStore()
const isTauriMode = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__

const portForwardingRef = ref<InstanceType<typeof PortForwarding> | null>(null)
const keyManagerRef = ref<InstanceType<typeof KeyManager> | null>(null)
const hostImportExportRef = ref<InstanceType<typeof HostImportExport> | null>(null)

const highlightedContent = computed(() => {
  const f = sshStore.openFiles[sshStore.activeFileIndex]
  if (!f) return ''
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  return highlightCode(f.content, ext)
})

const selectedServerId = ref('')

// Group collapsing state (Termius style)
const collapsedGroups = ref(new Set<string>())

function toggleGroup(groupName: string) {
  if (collapsedGroups.value.has(groupName)) {
    collapsedGroups.value.delete(groupName)
  } else {
    collapsedGroups.value.add(groupName)
  }
  // Trigger reactivity
  collapsedGroups.value = new Set(collapsedGroups.value)
}

// Grouped hosts computed
const groupedHosts = computed(() => {
  const groups = new Map<string, Array<typeof sshStore.filteredServers[number]>>()
  const ungrouped = 'Ungrouped'

  for (const server of sshStore.filteredServers) {
    const groupName = server.group || ungrouped
    if (!groups.has(groupName)) groups.set(groupName, [])
    groups.get(groupName)!.push(server)
  }

  return Array.from(groups.entries()).map(([name, hosts]) => ({
    name,
    hosts,
    onlineCount: hosts.filter(h => getServerStatus(h.id) === 'connected').length,
  }))
})

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
      ElMessageBox.confirm(`Delete "${server.name}"?`, t('workspace.confirm'), { type: 'warning', confirmButtonText: t('workspace.delete'), cancelButtonText: t('workspace.cancel') }).then(() => {
        sshStore.deleteServer(server.id)
        ElMessage.success(t('workspace.serverDeleted'))
      }).catch(() => {})
      break
    case 'copyAddr':
      navigator.clipboard.writeText(`${server.host}:${server.port}`)
      ElMessage.success(t('workspace.addressCopied'))
      break
    case 'copyName':
      navigator.clipboard.writeText(server.name)
      ElMessage.success(t('workspace.nameCopied'))
      break
    case 'portForwarding':
      portForwardingRef.value?.open()
      break
    case 'keyManager':
      keyManagerRef.value?.open()
      break
    case 'importExport':
      hostImportExportRef.value?.open()
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
  const session = sshStore.createSession(serverId)
  sshStore.updateSessionStatus(session.id, 'connecting')

  // Check if Tauri runtime is available (v1: __TAURI__, v2: __TAURI_INTERNALS__)
  const isTauri = !!(window as any).__TAURI__ || !!(window as any).__TAURI_INTERNALS__
  console.log('[handleConnect] isTauri:', isTauri, 'server:', server.host, 'port:', server.port)

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
    // CRITICAL: Must use store action to set realSessionId on the REACTIVE proxy,
    // not on the raw object returned by createSession(). Otherwise the Pinia
    // computed (activeSession) and TerminalPanel watchers never see the change.
    sshStore.setRealSessionId(session.id, result.session_id)
    sshStore.updateSessionStatus(session.id, 'connected')
    // Trigger PTY shell creation in TerminalPanel via counter watch (unambiguous)
    sshStore.requestPtyShell()
    console.log('[WorkspaceView] SSH connected, realSessionId:', result.session_id, 'ptyRequest:', sshStore.ptyRequestCount)
    ElMessage.success(t('workspace.connectedTo', { name: server.name }))
  } catch (e: any) {
    const errMsg = e?.message || e?.toString() || 'Unknown error'
    console.error('[handleConnect] SSH connect error:', errMsg, 'isTauri:', isTauri)

    if (isTauri) {
      // Tauri mode: real SSH failed — show error, don't fallback
      sshStore.updateSessionStatus(session.id, 'error', errMsg)
      ElMessage.error(t('workspace.connectionFailed', { error: errMsg }))
    } else {
      // No Tauri (npm run dev): fallback to demo
      console.warn('[handleConnect] No Tauri backend, using demo mode — realSessionId NOT set')
      setTimeout(() => {
        sshStore.updateSessionStatus(session.id, 'connected')
      }, 600)
    }
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

.host-list-top { flex-shrink: 0; padding: $spacing-sm; border-bottom: 1px solid $color-border-light; }

.search-input { :deep(.el-input__wrapper) { background-color: $color-bg-input !important; height: 26px; font-size: 11px !important; } }

// Termius-style group header
.host-group {
  // group header row
  .group-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px $spacing-md;
    cursor: pointer;
    user-select: none;
    transition: background-color $transition-fast;

    &:hover { background-color: $color-bg-hover; }
  }

  .group-chevron {
    color: $color-text-placeholder;
    transition: transform $transition-normal;
    flex-shrink: 0;

    &.expanded {
      transform: rotate(90deg);
    }
  }

  .group-name {
    font-size: $font-size-xs;
    font-weight: 600;
    color: $color-text-secondary;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    flex: 1;
  }

  .group-count {
    font-size: 10px;
    color: $color-text-placeholder;
    font-family: $font-family-mono;
  }

  .group-hosts {
    // hosts inside a group have slight indent
    .host-item {
      padding-left: $spacing-xl;
    }
  }
}

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
