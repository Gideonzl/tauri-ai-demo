/**
 * 服务器连接工作区 — 中间主区域
 * 对齐SSH_MODULE_SPEC.md：
 * 服务器列表(可拖拽伸缩120~400px，默认200px) + 终端面板flex:1
 * 顶部标签栏40px + 底部状态栏24px
 * 分组过滤 + 搜索 + 快捷命令 + cd→SFTP同步
 * Termius极简风格
 */
<template>
  <div class="workspace-view" @contextmenu.prevent>
    <!-- 顶部标签栏 40px -->
    <div class="tab-bar">
      <div class="tab-item hosts-tab" :class="{ active: leftPanelMode === 'hosts' }" @click="showHostList">
        <el-icon :size="14"><Monitor /></el-icon>
        <span>{{ t('workspace.hosts') }}</span>
      </div>
      <div v-for="session in sshStore.sessions" :key="session.id" class="tab-item session-tab" :data-session-id="session.id" :class="{ active: session.id === sshStore.activeSessionId && leftPanelMode !== 'hosts', 'drop-before': dropTargetSessionId === session.id && dropPlacement === 'before', 'drop-after': dropTargetSessionId === session.id && dropPlacement === 'after', dragging: draggedSessionId === session.id }" @click="onSessionTabClick(session.id)" @pointerdown="onSessionTabPointerDown($event, session.id)">
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
      <button v-if="terminalFocusMode" class="focus-exit-tab" title="退出专注终端模式" @click="toggleTerminalFocusMode">退出专注</button>
    </div>

    <!-- 内容区：分栏布局 -->
    <div class="workspace-content">
      <!-- 左侧面板 -->
      <div class="host-list-panel" :class="{ collapsed: hostListCollapsed }" :style="{ width: hostListCollapsed ? '0px' : hostListWidth + 'px' }">
        <template v-if="leftPanelMode === 'hosts'">
          <div class="host-list-top">
            <el-input v-model="sshStore.searchQuery" size="small"  :placeholder="t('workspace.searchHosts')" clearable class="search-input">
              <template #prefix><el-icon :size="14"><Search /></el-icon></template>
            </el-input>
            <!-- Group filter + manage -->
            <div class="group-filter-bar">
              <el-select
                v-model="sshStore.selectedGroupName"
                size="small"
                :placeholder="t('workspace.allGroups')"
                clearable
                class="group-select"
                @clear="sshStore.selectedGroupName = ''"
              >
                <el-option :label="t('workspace.allServers')" value="" />
                <el-option
                  v-for="name in sshStore.allGroupNames"
                  :key="name"
                  :label="name"
                  :value="name"
                />
              </el-select>
              <el-button size="small" text @click="showAddGroup" :title="t('workspace.addGroup')">
                <el-icon :size="12"><Plus /></el-icon>
              </el-button>
              <el-button v-if="sshStore.selectedGroupName" size="small" text @click="renameCurrentGroup" :title="t('workspace.renameGroup')">
                <el-icon :size="12"><Edit /></el-icon>
              </el-button>
              <el-button v-if="sshStore.selectedGroupName" size="small" text @click="deleteCurrentGroup" :title="t('workspace.deleteGroup')">
                <el-icon :size="12"><Delete /></el-icon>
              </el-button>
            </div>
          </div>
          <div class="host-list">
            <!-- Grouped host list (Termius style) -->
            <template v-for="group in groupedHosts" :key="group.name">
              <div class="host-group">
                <div class="group-header" @click="toggleGroup(group.name)" @contextmenu.prevent="showGroupMenu($event, group)">
                  <el-icon :size="12" class="group-chevron" :class="{ expanded: !collapsedGroups.has(group.name) || isSearching }">
                    <ArrowRight />
                  </el-icon>
                  <span class="group-name">{{ group.name }}</span>
                  <span class="group-count">{{ group.onlineCount }}/{{ group.hosts.length }}</span>
                </div>
                <div v-if="!collapsedGroups.has(group.name) || isSearching" class="group-hosts">
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

      <button v-if="hostListCollapsed && !terminalFocusMode" class="host-list-restore" title="展开主机列表" @click="restoreHostList">›</button>
      <div v-else class="resize-bar-hostlist" @mousedown="onHostListResizeStart" />

      <div class="terminal-area">
        <!-- File viewer + Terminal split layout (Xterminal style) -->
        <template v-if="sshStore.activeSession">
          <!-- File viewer top section -->
          <div v-if="sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex]" class="fv-section" :style="{ height: fileViewerHeight + 'px' }">
            <div class="fv-toolbar">
              <span class="fv-title">{{ sshStore.openFiles[sshStore.activeFileIndex].name }}</span>
              <span class="fv-path">{{ sshStore.openFiles[sshStore.activeFileIndex].path }}</span>
              <div class="fv-actions">
                <template v-if="!fileEditMode">
                  <el-button size="small" text @click="enterEditMode" :title="t('common.editFile')">
                    <el-icon :size="13"><Edit /></el-icon>
                  </el-button>
                </template>
                <template v-else>
                  <el-button size="small" text type="primary" @click="saveCurrentFile" :loading="savingFile" :title="t('common.save')">
                    <el-icon :size="13"><Check /></el-icon>
                  </el-button>
                  <el-button size="small" text @click="cancelEdit" :title="t('common.cancelEdit')">
                    <el-icon :size="13"><Close /></el-icon>
                  </el-button>
                </template>
                <el-button size="small" text @click="sshStore.activeFileIndex = -1" :title="t('workspace.closeFiles')">
                  <el-icon :size="13"><Close /></el-icon>
                </el-button>
              </div>
            </div>
            <div class="fv-body">
              <pre v-if="!fileEditMode" class="fv-content" v-html="highlightedContent" @contextmenu.prevent="onFileViewerContextMenu"></pre>
              <textarea v-else ref="editTextareaRef" class="fv-editor" v-model="editContent" @keydown="onEditorKeydown" spellcheck="false"></textarea>
            </div>
          </div>
          <!-- Resize handle between file viewer and terminal -->
          <div v-if="sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex]" class="split-handle" @mousedown="onSplitResizeStart"></div>
          <!-- Terminal bottom section -->
          <div class="term-section" :class="{ 'has-files': sshStore.activeFileIndex >= 0 && sshStore.openFiles[sshStore.activeFileIndex] }">
            <QuickCommands :force-collapsed="terminalFocusMode" />
            <!-- Render independent TerminalPanel per session — only active one visible -->
            <div v-for="s in sshStore.sessions" :key="s.id" v-show="s.id === sshStore.activeSessionId" class="term-panel-wrapper">
              <TerminalPanel :session="s" @cwd-change="onCwdChange" />
            </div>
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

    <footer v-if="!terminalFocusMode" class="status-bar">
      <span class="status-item" :class="isTauriMode ? 'text-success' : 'text-warning'" style="font-weight:600">
        <span class="status-dot" :class="isTauriMode ? 'bg-success' : 'bg-warning'"></span>
        {{ isTauriMode ? 'TAURI' : t('workspace.demo') }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item" v-if="sshStore.activeSession">
        <span class="status-server-name">{{ sshStore.activeSession.serverName }}</span>
        <span v-if="sshStore.activeSession.realSessionId" class="text-success" style="font-weight:600"> {{ t('workspace.real') }}</span>
        <span v-else class="text-warning"> {{ t('workspace.demo') }}</span>
        -
        <span :class="'status-text-' + sshStore.activeSession.status">{{ sshStore.activeSession.status }}</span>
      </span>
      <span class="status-sep" v-if="sshStore.activeSession">|</span>
      <span class="status-item">
        <span class="status-dot" :class="{ online: modelStore.defaultConfig }"></span>
        {{ modelStore.defaultConfig ? t('ai.ready') : t('ai.na') }}
      </span>
      <span class="status-sep">|</span>
      <span class="status-item">v1.0.0</span>
    </footer>

    <SshConnectDialog />
    <PortForwarding ref="portForwardingRef" />
    <KeyManager ref="keyManagerRef" />
    <HostImportExport ref="hostImportExportRef" />

    <!-- 服务器右键菜单 — 与 SFTP 文件树右键完全一致（无 teleport，position:fixed 定位） -->
    <div v-if="hostMenu.visible" class="ctx-menu" :style="{ left: hostMenu.x + 'px', top: hostMenu.y + 'px' }">
      <div class="ctx-item" @click="hostMenuAction('connect')"><el-icon :size="13"><SetUp /></el-icon><span>{{ t('workspace.connect') }}</span></div>
      <div class="ctx-item" @click="hostMenuAction('edit')"><el-icon :size="13"><Edit /></el-icon><span>{{ t('workspace.edit') }}</span></div>
      <div class="ctx-item" @click="hostMenuAction('changeGroup')"><el-icon :size="13"><FolderOpened /></el-icon><span>{{ t('workspace.changeGroup') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="hostMenuAction('copyAddr')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('workspace.copyAddress') }}</span></div>
      <div class="ctx-item" @click="hostMenuAction('copyName')"><el-icon :size="13"><Link /></el-icon><span>{{ t('workspace.copyName') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="hostMenuAction('portForwarding')"><el-icon :size="13"><Connection /></el-icon><span>{{ t('workspace.portForwarding') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="hostMenuAction('keyManager')"><el-icon :size="13"><Key /></el-icon><span>{{ t('workspace.keyManager') }}</span></div>
      <div class="ctx-item" @click="hostMenuAction('importExport')"><el-icon :size="13"><Upload /></el-icon><span>{{ t('workspace.importExport') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="hostMenuAction('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('workspace.delete') }}</span></div>
    </div>

    <!-- 分组右键菜单 -->
    <div v-if="groupCtxMenu.visible" class="ctx-menu" :style="{ left: groupCtxMenu.x + 'px', top: groupCtxMenu.y + 'px' }">
      <div class="ctx-item" @click="groupMenuAct('rename')"><el-icon :size="13"><Edit /></el-icon><span>{{ t('workspace.renameGroup') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="groupMenuAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('workspace.delete') }}</span></div>
    </div>

    <!-- 文件查看器右键菜单 — 复用 ctx-menu 样式 -->
    <div v-if="fvMenu.visible" class="ctx-menu" :style="{ left: fvMenu.x + 'px', top: fvMenu.y + 'px' }">
      <div class="ctx-item" @click="fvMenuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
      <div class="ctx-item" @click="fvMenuAct('selectAll')"><el-icon :size="13"><Select /></el-icon><span>{{ t('common.selectAll') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="fvMenuAct('print')"><el-icon :size="13"><Printer /></el-icon><span>{{ t('common.print') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="fvMenuAct('copyPath')"><el-icon :size="13"><Link /></el-icon><span>{{ t('sftp.copyPath') }}</span></div>
      <div class="ctx-item" @click="fvMenuAct('copyName')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('sftp.copyName') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item" @click="fvMenuAct('close')"><el-icon :size="13"><Close /></el-icon><span>{{ t('common.closeFile') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, provide, watch, nextTick, inject } from 'vue'
import type { Ref } from 'vue'
import { useSshStore } from '@/stores/ssh'
import { useConfigStore } from '@/stores/config'
import { useLocale } from '@/composables/useLocale'
import { highlightCode } from '@/utils/highlight'
import { useModelStore } from '@/stores/model'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, Plus, Close, SetUp, ArrowLeft, ArrowRight, Search, Edit, Delete, CopyDocument, Link, Document, Connection, Key, Upload, Printer, Select, FolderOpened, Check } from '@element-plus/icons-vue'
import TerminalPanel from '@/components/TerminalPanel.vue'
import SshConnectDialog from '@/components/SshConnectDialog.vue'
import SftpTree from '@/components/SftpTree.vue'
import QuickCommands from '@/components/QuickCommands.vue'
import PortForwarding from '@/components/PortForwarding.vue'
import KeyManager from '@/components/KeyManager.vue'
import HostImportExport from '@/components/HostImportExport.vue'
import { useContextMenu } from '@/composables/useContextMenu'
import { getSessionTabDropPlacement } from '@/utils/sessionTabOrder'

const sshStore = useSshStore()
const modelStore = useModelStore()
const { t } = useLocale()
const configStore = useConfigStore()
const isTauriMode = !!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__
const { register, unregister } = useContextMenu()
const terminalFocusMode = inject<Ref<boolean>>('terminalFocusMode', ref(false))
const toggleTerminalFocusMode = inject<() => void>('toggleTerminalFocusMode', () => {})

const portForwardingRef = ref<InstanceType<typeof PortForwarding> | null>(null)
const keyManagerRef = ref<InstanceType<typeof KeyManager> | null>(null)
const hostImportExportRef = ref<InstanceType<typeof HostImportExport> | null>(null)

const highlightedContent = computed(() => {
  const f = sshStore.openFiles[sshStore.activeFileIndex]
  if (!f) return ''
  const ext = f.name.split('.').pop()?.toLowerCase() || ''
  return highlightCode(f.content, ext)
})

// File edit mode
const fileEditMode = ref(false)
const editContent = ref('')
const savingFile = ref(false)
const editTextareaRef = ref<HTMLTextAreaElement>()

function enterEditMode() {
  const file = sshStore.openFiles[sshStore.activeFileIndex]
  if (file) {
    editContent.value = file.content
    fileEditMode.value = true
    nextTick(() => editTextareaRef.value?.focus())
  }
}

function cancelEdit() {
  fileEditMode.value = false
  editContent.value = ''
}

async function saveCurrentFile() {
  const file = sshStore.openFiles[sshStore.activeFileIndex]
  if (!file) return
  savingFile.value = true
  const content = editContent.value
  const sid = sshStore.activeSession?.realSessionId
  if (sid) {
    try {
      // Base64-encode to safely write any file content (handles quotes, newlines, special chars)
      const encoder = new TextEncoder()
      const bytes = encoder.encode(content)
      const chunkSize = 0x8000
      const parts: string[] = []
      for (let i = 0; i < bytes.length; i += chunkSize) {
        parts.push(String.fromCharCode(...bytes.subarray(i, i + chunkSize)))
      }
      const b64 = btoa(parts.join(''))
      const safePath = file.path.replace(/'/g, `'\\''`)
      const { sshExec } = await import('@/api/tauri')
      await sshExec(sid, `echo '${b64}' | base64 -d > '${safePath}'`)
      file.content = content
      ElMessage.success(t('common.fileSaved'))
      fileEditMode.value = false
    } catch (e: any) {
      ElMessage.error(t('common.fileSaveFailed') + ': ' + (e?.message || String(e)))
    }
  } else {
    file.content = content
    ElMessage.success(t('common.fileSaved'))
    fileEditMode.value = false
  }
  savingFile.value = false
}

function onEditorKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveCurrentFile()
    return
  }
  if (e.key === 'Escape') {
    cancelEdit()
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    const ta = e.target as HTMLTextAreaElement
    const s = ta.selectionStart, en = ta.selectionEnd
    editContent.value = editContent.value.slice(0, s) + '  ' + editContent.value.slice(en)
    void nextTick(() => { ta.selectionStart = ta.selectionEnd = s + 2 })
  }
}

// Cancel edit when switching files
watch(() => sshStore.activeFileIndex, () => {
  if (fileEditMode.value) cancelEdit()
})

const selectedServerId = ref('')

// Group management
function renameCurrentGroup() {
  const g = sshStore.groups.find(g => g.name === sshStore.selectedGroupName)
  if (g) handleGroupRename(g.id, g.name)
}

function deleteCurrentGroup() {
  const g = sshStore.groups.find(g => g.name === sshStore.selectedGroupName)
  if (g) handleGroupDelete(g.id, g.name)
}

function showAddGroup() {
  ElMessageBox.prompt(t('workspace.groupName'), t('workspace.newGroup'), {
    confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel')
  }).then(({ value }) => {
      if (value?.trim()) sshStore.addGroup(value.trim())
    }).catch(() => {})
}

function handleGroupRename(groupId: string, currentName: string) {
  ElMessageBox.prompt(t('workspace.newName'), t('workspace.renameGroup'), {
    inputValue: currentName,
    confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel')
  }).then(({ value }) => {
      if (value?.trim()) sshStore.renameGroup(groupId, value.trim())
    }).catch(() => {})
}

function handleGroupDelete(groupId: string, groupName: string) {
  ElMessageBox.confirm(
    t('workspace.confirmDeleteGroup', { name: groupName }),
    t('workspace.deleteGroup'),
    { type: 'warning', confirmButtonText: t('workspace.delete'), cancelButtonText: t('common.cancel') }
  ).then(() => sshStore.deleteGroup(groupId)).catch(() => {})
}

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

// Group context menu
const groupCtxMenu = reactive({ visible: false, x: 0, y: 0, groupId: '', groupName: '' })

function showGroupMenu(e: MouseEvent, group: { name: string }) {
  const g = sshStore.groups.find(x => x.name === group.name)
  if (!g) return
  groupCtxMenu.groupId = g.id
  groupCtxMenu.groupName = g.name
  groupCtxMenu.x = e.clientX
  groupCtxMenu.y = e.clientY
  groupCtxMenu.visible = true
}

function groupMenuAct(action: string) {
  const gid = groupCtxMenu.groupId
  const gn = groupCtxMenu.groupName
  groupCtxMenu.visible = false
  if (action === 'rename') handleGroupRename(gid, gn)
  if (action === 'delete') handleGroupDelete(gid, gn)
}

// True when a search query or group filter is narrowing the list
const isSearching = computed(() => !!sshStore.searchQuery.trim() || !!sshStore.selectedGroupName)

// Grouped hosts computed — shows all groups normally; hides empty groups while searching
const groupedHosts = computed(() => {
  const map = new Map<string, Array<typeof sshStore.filteredServers[number]>>()

  // Seed with ALL groups from store (including empty ones)
  for (const g of sshStore.groups) {
    map.set(g.name, [])
  }

  // Distribute servers into their groups
  const ungrouped = 'Ungrouped'  // label uses i18n via t('workspace.ungrouped') for display
  for (const server of sshStore.filteredServers) {
    const gn = server.group || ungrouped
    if (!map.has(gn)) map.set(gn, [])
    map.get(gn)!.push(server)
  }

  // Ungrouped always last
  let entries = Array.from(map.entries()).map(([name, hosts]) => ({
    name,
    hosts,
    onlineCount: hosts.filter(h => getServerStatus(h.id) === 'connected').length,
  }))

  // While searching/filtering, drop groups with no matching hosts so results are obvious
  if (isSearching.value) {
    entries = entries.filter(g => g.hosts.length > 0)
  }

  return entries.sort((a, b) => a.name === ungrouped ? 1 : b.name === ungrouped ? -1 : a.name.localeCompare(b.name))
})

// 服务器右键菜单状态
const hostMenu = reactive({ visible: false, x: 0, y: 0, server: null as any })

function hideHostMenu() { hostMenu.visible = false }

function hideAllMenus() { hideHostMenu(); hideFvMenu(); groupCtxMenu.visible = false }

function showHostMenu(e: MouseEvent, server: any) {
  hostMenu.server = server
  hostMenu.x = e.clientX
  hostMenu.y = e.clientY
  hostMenu.visible = true
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
    case 'changeGroup': {
      const existing = sshStore.allGroupNames.filter(n => n !== server.group)
      const hint = existing.length > 0 ? `\n\n${t('workspace.existingGroups')} ${existing.join(', ')}` : ''
      const currentGroup = server.group || ''
      ElMessageBox.prompt(
        `${t('workspace.currentGroup')} ${currentGroup || t('workspace.noGroup')}${hint}\n\n${t('workspace.changeGroupHint')}`,
        t('workspace.changeGroup'),
        {
          inputValue: currentGroup,
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
        }
      ).then(({ value }) => {
        const newGroup = value?.trim()
        sshStore.updateServer(server.id, { group: newGroup || undefined })
        if (newGroup && !sshStore.groups.find(g => g.name === newGroup)) {
          sshStore.addGroup(newGroup)
        }
        ElMessage.success(t('workspace.movedTo', { group: newGroup || t('workspace.ungrouped') }))
      }).catch(() => {})
      break
    }
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

// 文件查看器右键菜单
const fvMenu = reactive({ visible: false, x: 0, y: 0 })

function onFileViewerContextMenu(e: MouseEvent) {
  fvMenu.x = e.clientX
  fvMenu.y = e.clientY
  fvMenu.visible = true
}

function hideFvMenu() { fvMenu.visible = false }

function fvMenuAct(action: string) {
  hideFvMenu()
  const file = sshStore.openFiles[sshStore.activeFileIndex]
  const contentEl = document.querySelector('.fv-content')
  switch (action) {
    case 'copy': {
      const sel = window.getSelection()
      if (sel?.toString()) {
        navigator.clipboard.writeText(sel.toString())
        ElMessage.success('Copied')
      }
      break
    }
    case 'selectAll': {
      if (contentEl) {
        const range = document.createRange()
        range.selectNodeContents(contentEl)
        const sel = window.getSelection()
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
      break
    }
    case 'print': window.print(); break
    case 'copyPath':
      if (file) {
        navigator.clipboard.writeText(file.path)
        ElMessage.success(t('workspace.addressCopied'))
      }
      break
    case 'copyName':
      if (file) {
        navigator.clipboard.writeText(file.name)
        ElMessage.success(t('workspace.nameCopied'))
      }
      break
    case 'close':
      sshStore.activeFileIndex = -1
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

/** Switch to host list view without disconnecting the active session */
function showHostList() {
  leftPanelMode.value = 'hosts'
}

/** Switch to a session tab (show SFTP + terminal) */
function switchToSession(sessionId: string) {
  sshStore.switchSession(sessionId)
  leftPanelMode.value = 'sftp'
}

const draggedSessionId = ref('')
const dropTargetSessionId = ref('')
const dropPlacement = ref<'before' | 'after'>('before')
let sessionTabPointerId: number | null = null
let sessionTabStartX = 0
let sessionTabMoved = false
let suppressSessionTabClick = false

function onSessionTabPointerDown(event: PointerEvent, sessionId: string) {
  if (event.button !== 0) return
  draggedSessionId.value = sessionId
  dropTargetSessionId.value = ''
  sessionTabPointerId = event.pointerId
  sessionTabStartX = event.clientX
  sessionTabMoved = false
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  document.addEventListener('pointermove', onSessionTabPointerMove)
  document.addEventListener('pointerup', onSessionTabPointerUp)
  document.addEventListener('pointercancel', onSessionTabPointerUp)
}

function updateSessionTabDropTarget(event: PointerEvent) {
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.session-tab')
  const targetId = target?.dataset.sessionId
  if (!targetId || targetId === draggedSessionId.value) {
    dropTargetSessionId.value = ''
    return
  }
  dropTargetSessionId.value = targetId
  dropPlacement.value = getSessionTabDropPlacement(target.getBoundingClientRect(), event.clientX)
}

function onSessionTabPointerMove(event: PointerEvent) {
  if (event.pointerId !== sessionTabPointerId) return
  if (Math.abs(event.clientX - sessionTabStartX) > 4) sessionTabMoved = true
  if (sessionTabMoved) updateSessionTabDropTarget(event)
}

function onSessionTabPointerUp(event?: PointerEvent) {
  if (event && event.pointerId !== sessionTabPointerId) return
  if (sessionTabMoved && draggedSessionId.value && dropTargetSessionId.value) {
    sshStore.reorderSessions(draggedSessionId.value, dropTargetSessionId.value, dropPlacement.value)
    suppressSessionTabClick = true
    window.setTimeout(() => { suppressSessionTabClick = false }, 0)
  }
  draggedSessionId.value = ''
  dropTargetSessionId.value = ''
  sessionTabPointerId = null
  document.removeEventListener('pointermove', onSessionTabPointerMove)
  document.removeEventListener('pointerup', onSessionTabPointerUp)
  document.removeEventListener('pointercancel', onSessionTabPointerUp)
}

function onSessionTabClick(sessionId: string) {
  if (suppressSessionTabClick) return
  switchToSession(sessionId)
}

// === 服务器列表伸缩 ===
const HOST_LIST_MIN = 120
const HOST_LIST_MAX = 400
const HOST_LIST_DEFAULT = 200
const hostListWidth = ref(HOST_LIST_DEFAULT)
const hostListCollapsed = ref(false)
const focusHostListSnapshot = ref<{ width: number; collapsed: boolean } | null>(null)
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

function restoreHostList() {
  hostListCollapsed.value = false
  hostListWidth.value = Math.max(HOST_LIST_MIN, focusHostListSnapshot.value?.width || HOST_LIST_DEFAULT)
}

watch(terminalFocusMode, (enabled) => {
  if (enabled) {
    focusHostListSnapshot.value = { width: hostListWidth.value, collapsed: hostListCollapsed.value }
    hostListCollapsed.value = true
    hostListWidth.value = 0
  } else if (focusHostListSnapshot.value) {
    hostListWidth.value = focusHostListSnapshot.value.width
    hostListCollapsed.value = focusHostListSnapshot.value.collapsed
    focusHostListSnapshot.value = null
  }
}, { immediate: true })

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
  const isTauri = isTauriMode
  console.log('[handleConnect] isTauri:', isTauri, 'server:', server.host, 'port:', server.port)

  try {
    const { sshConnect } = await import('@/api/tauri')
    const result = await sshConnect({
      host: server.host,
      port: server.port,
      username: server.username,
      auth: server.authType === 'password'
        ? { type: 'password', password: server.password || '' }
        : { type: 'private_key', key_path: server.keyPath || undefined, key_ref: server.keyRef || undefined, passphrase: server.keyPassphrase || undefined },
      timeout_ms: 10000,
      remark: server.remark || '',
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
  register(hideAllMenus)
  document.addEventListener('click', hideAllMenus)
})

onUnmounted(() => {
  unregister(hideAllMenus)
  document.removeEventListener('click', hideAllMenus)
  document.removeEventListener('mousemove', onHostListResizeMove)
  document.removeEventListener('mouseup', onHostListResizeEnd)
  onSessionTabPointerUp()
})
</script>

<style lang="scss" scoped>
.workspace-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.tab-bar { height: 40px; display: flex; align-items: center; padding: 0 $spacing-xs; background: linear-gradient(90deg, $color-bg-active, transparent 32%), $surface-contrast; border-bottom: 1px solid $color-border; flex-shrink: 0; gap: 2px; overflow-x: auto; }

.tab-item { display: flex; align-items: center; gap: 5px; padding: 0 12px; height: 32px; border-radius: $border-radius-sm; cursor: pointer; color: $color-text-secondary; font-size: $font-size-sm; white-space: nowrap; transition: all $transition-fast; position: relative;
  &:hover { background-color: $color-bg-hover; color: $color-text-regular; }
  &.active { color: $color-text-primary; background-color: $color-bg-active;
    &::after { content: ''; position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 16px; height: 2px; background-color: $color-primary; border-radius: 1px 1px 0 0; box-shadow: $glow-soft; animation: scale-in 0.2s ease; }
  }
  &.session-tab { cursor: grab; user-select: none; -webkit-user-select: none; touch-action: none; }
  &.session-tab.dragging { cursor: grabbing; opacity: 0.82; }
  &.drop-before { box-shadow: inset 2px 0 0 $color-primary; }
  &.drop-after { box-shadow: inset -2px 0 0 $color-primary; }
}

.hosts-tab { font-weight: 600; }
.add-tab { width: 32px; justify-content: center; padding: 0; }

.tab-status { width: 6px; height: 6px; border-radius: 50%; background-color: $color-text-muted; flex-shrink: 0;
  &.connecting { background-color: $color-warning; } &.connected { background-color: $color-success; } &.disconnected { background-color: $color-text-muted; } &.error { background-color: $color-danger; } &.reconnecting { background-color: $color-warning; animation: pulse 1s infinite; }
}

@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.tab-close { margin-left: 2px; color: $color-text-muted; &:hover { color: $color-danger; } }

.workspace-content { flex: 1; overflow: hidden; display: flex; }

.host-list-panel { border-right: 1px solid $color-border; display: flex; flex-direction: column; flex-shrink: 0; background: linear-gradient(180deg, $surface-contrast-soft, $color-bg-primary); overflow: hidden; transition: width 0.18s ease;
  &.collapsed { border-right: none; }
}

.host-list-top { flex-shrink: 0; padding: $spacing-sm $spacing-sm 0 $spacing-sm; border-bottom: 1px solid $color-border-light; }

.group-filter-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: $spacing-xs 0;
  margin-top: $spacing-xs;
}

.group-select {
  flex: 1;
}

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

.host-item { display: flex; align-items: center; gap: $spacing-sm; padding: 0 $spacing-md; height: 48px; cursor: pointer; transition: background-color $transition-fast, transform $transition-fast; position: relative;
  &:hover { background-color: $color-bg-hover; transform: translateX(2px); }
  &.active { background-color: $color-bg-active;
    &::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 2px; background-color: $color-primary; border-radius: 0 1px 1px 0; box-shadow: $glow-soft; }
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

.terminal-area { flex: 1; overflow: hidden; display: flex; flex-direction: column; background: radial-gradient(circle at 50% 42%, $color-bg-active, transparent 38%), $shell-workspace-bg; }

.terminal-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: $spacing-sm; color: $color-text-secondary;
  .empty-icon { color: $color-primary; opacity: 0.68; filter: drop-shadow($glow-soft); } p { font-size: $font-size-md; color: $color-text-primary; } .sub { font-size: $font-size-sm; color: $color-text-secondary; }
}

.host-list-restore { width: 18px; min-width: 18px; border: 0; border-right: 1px solid $color-border; background: $surface-contrast; color: $color-text-secondary; cursor: pointer; padding: 0; font-size: 18px;
  &:hover { color: $color-primary; background: $color-bg-hover; }
}

.focus-exit-tab { height: 26px; margin-left: auto; border: 1px solid $color-border; border-radius: $border-radius-sm; background: $color-bg-active; color: $color-text-secondary; cursor: pointer; padding: 0 9px; font-size: $font-size-xs;
  &:hover { color: $color-primary; border-color: $color-primary; }
}

.status-bar { height: $status-bar-height; background: $surface-contrast; border-top: 1px solid $color-border; display: flex; align-items: center; padding: 0 $spacing-md; gap: $spacing-sm; flex-shrink: 0; font-size: $font-size-xs; color: $color-text-secondary; font-family: $font-family-mono;
  .status-item { display: flex; align-items: center; gap: 4px; }
  .status-server-name { color: $color-primary-light; font-weight: 600; }
  .status-sep { color: $color-text-muted; }
  .status-dot { width: 5px; height: 5px; border-radius: 50%; background-color: $color-danger; &.online { background-color: $color-success; animation: glow-pulse 2s ease-in-out infinite; } }
  .status-text-connected { color: $color-success; } .status-text-connecting { color: $color-warning; } .status-text-disconnected { color: $color-text-muted; } .status-text-error { color: $color-danger; } .status-text-reconnecting { color: $color-warning; }
}


// File viewer (Xterminal style)
.file-viewer {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background-color: $color-bg-app;
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
  color: $color-text-primary; white-space: pre; user-select: text;
  -webkit-user-select: text;
}

.tab-loading { font-size: 10px; color: $color-text-muted; animation: pulse 1s infinite; }

// File viewer + terminal split layout
.fv-section {
  display: flex; flex-direction: column; overflow: hidden; flex-shrink: 0;
  background-color: $color-bg-app; border-bottom: 1px solid $color-border-light;
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
  color: $color-text-primary; white-space: pre; user-select: text; -webkit-user-select: text;
}

.fv-editor {
  width: 100%; height: 100%; border: none; outline: none; resize: none;
  padding: $spacing-sm $spacing-md;
  font-family: $font-family-mono; font-size: $font-size-sm; line-height: 1.5;
  color: $color-text-primary; background-color: $color-bg-app;
  tab-size: 2; white-space: pre; overflow-wrap: normal; overflow-x: auto;
  &::selection { background-color: rgba(91, 141, 239, 0.3); }
}

.split-handle {
  height: 4px; flex-shrink: 0; cursor: row-resize; position: relative; z-index: 3;
  background-color: transparent; transition: background-color 0.15s;
  &::after { content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 30px; height: 2px; background-color: $color-border; border-radius: 1px; }
  &:hover::after { background-color: $color-primary; }
}

.term-section { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-height: 100px; }

.term-panel-wrapper { flex: 1; overflow: hidden; min-height: 0; }

.tab-loading { font-size: 10px; color: $color-text-muted; animation: pulse 1s infinite; }
</style>
