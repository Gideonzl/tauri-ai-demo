<!-- CommandHistoryView — 按服务器分类的命令历史记录 -->
<template>
  <div class="cmd-history-view" @contextmenu.prevent="onCtx">
    <div class="history-header">
      <div class="header-left">
        <el-icon :size="16"><Clock /></el-icon>
        <span class="header-title">Command History</span>
      </div>
      <div class="header-right">
        <el-button size="small" text @click="handleRefresh" title="刷新">
          <el-icon :size="14"><Refresh /></el-icon>
        </el-button>
        <el-select
          v-model="selectedServerId"
          size="small"
          placeholder="Select server"
          class="server-select"
          :popper-append-to-body="false"
        >
          <el-option
            v-for="s in visibleHistoryServers"
            :key="s.serverId"
            :label="s.serverName"
            :value="s.serverId"
          />
        </el-select>
        <el-button v-if="selectedServerId" size="small" text @click="clearCurrent">
          <el-icon :size="13"><Delete /></el-icon>
        </el-button>
      </div>
    </div>

    <!-- Current server info -->
    <div v-if="activeServer && selectedServerId === activeServer.serverId" class="current-server-bar">
      <el-icon :size="12"><Connection /></el-icon>
      <span>{{ activeServer.username }}@{{ activeServer.host }}:{{ activeServer.port }}</span>
      <span class="live-badge">LIVE</span>
    </div>

    <!-- Command list -->
    <div class="command-list" v-if="filteredCommands.length > 0">
      <div
        v-for="cmd in filteredCommands"
        :key="cmd.id"
        class="command-item"
        @dblclick="executeCommand(cmd)"
        @contextmenu.prevent="showMenu($event, cmd)"
      >
        <div class="cmd-header">
          <span class="cmd-time">{{ formatTime(cmd.timestamp) }}</span>
          <span v-if="cmd.cwd" class="cmd-cwd">{{ cmd.cwd }}</span>
        </div>
        <div class="cmd-text">
          <code>{{ cmd.command }}</code>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <el-icon :size="36"><Clock /></el-icon>
      <p v-if="!selectedServerId">Select a server to view its command history</p>
      <p v-else>No command history for this server</p>
      <p class="sub">Commands will be recorded when you type in the terminal</p>
    </div>

    <!-- Right-click context menu -->
    <div v-if="menu.visible" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <div class="ctx-item" @click="menuAct('execute')"><el-icon :size="13"><VideoPlay /></el-icon><span>{{ t('common.execute') }}</span></div>
      <div class="ctx-item" @click="menuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="menuAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('workspace.delete') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, onActivated, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Clock, Connection, Delete, VideoPlay, CopyDocument, Refresh } from '@element-plus/icons-vue'
import { useCommandHistoryStore } from '@/stores/commandHistory'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { ElMessage } from 'element-plus'

const cmdStore = useCommandHistoryStore()
const sshStore = useSshStore()
const router = useRouter()
const { t } = useLocale()

const selectedServerId = ref('')
const menu = reactive({ visible: false, x: 0, y: 0, cmd: null as any })

// Active server from SSH session
const activeServer = computed(() => {
  const session = sshStore.activeSession
  if (!session) return null
  return sshStore.servers.find(s => s.id === session.serverId) || null
})

// Only show history for servers that currently exist — prevents leaking old IPs
const existingServerIds = computed(() => new Set(sshStore.servers.map(s => s.id)))

const visibleHistoryServers = computed(() => {
  return cmdStore.historyServers.filter(h => existingServerIds.value.has(h.serverId))
})

// Purge orphaned history + sync selection when servers change
function syncWithServers() {
  cmdStore.purgeOrphaned(sshStore.servers.map(s => s.id))
  // Reset selection if selected server no longer exists
  if (selectedServerId.value && !existingServerIds.value.has(selectedServerId.value)) {
    selectedServerId.value = visibleHistoryServers.value[0]?.serverId || ''
  }
}

// Auto-select active server on mount
onMounted(() => {
  document.addEventListener('click', hideMenu)
  syncWithServers()
  if (activeServer.value && existingServerIds.value.has(activeServer.value.id)) {
    selectedServerId.value = activeServer.value.id
  } else if (visibleHistoryServers.value.length > 0) {
    selectedServerId.value = visibleHistoryServers.value[0].serverId
  }
})

// Watch server list changes — purge and re-sync
watch(() => sshStore.servers.length, () => {
  syncWithServers()
})

// Auto-refresh when returning to this view (kept alive) — shows commands just run
onActivated(() => {
  cmdStore.reload()
  syncWithServers()
  const activeId = sshStore.activeSession?.serverId
  if (activeId && visibleHistoryServers.value.find(h => h.serverId === activeId)) {
    selectedServerId.value = activeId
  }
})

// Also watch when entries change (from purge) to keep selection valid
watch(() => cmdStore.entries.length, () => {
  if (selectedServerId.value && !existingServerIds.value.has(selectedServerId.value)) {
    selectedServerId.value = visibleHistoryServers.value[0]?.serverId || ''
  }
})

onUnmounted(() => document.removeEventListener('click', hideMenu))

const filteredCommands = computed(() => {
  if (!selectedServerId.value) return []
  return cmdStore.getEntries(selectedServerId.value)
})

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function executeCommand(cmd: any) {
  const session = sshStore.activeSession
  if (session) {
    // Push command to the active terminal (kept alive in workspace) and go see it run
    sshStore.runInTerminal(cmd.command)
    ElMessage.success('Command sent to terminal')
    router.push('/')
  } else {
    navigator.clipboard.writeText(cmd.command)
    ElMessage.success('No active server — copied to clipboard')
  }
}

function clearCurrent() {
  if (selectedServerId.value) {
    cmdStore.clearServer(selectedServerId.value)
  }
}

/** 手动刷新：重载历史 + 自动选中当前活动服务器（看到刚执行的命令） */
function handleRefresh() {
  cmdStore.reload()
  syncWithServers()
  const activeId = sshStore.activeSession?.serverId
  if (activeId && visibleHistoryServers.value.find(h => h.serverId === activeId)) {
    selectedServerId.value = activeId
  } else if (!selectedServerId.value && visibleHistoryServers.value.length > 0) {
    selectedServerId.value = visibleHistoryServers.value[0].serverId
  }
  ElMessage.success(t('common.refresh'))
}

function onCtx(e: MouseEvent) { /* prevent browser menu */ }

function showMenu(e: MouseEvent, cmd: any) {
  menu.cmd = cmd
  menu.x = e.clientX
  menu.y = e.clientY
  menu.visible = true
}

function hideMenu() { menu.visible = false }

function menuAct(action: string) {
  const cmd = menu.cmd
  hideMenu()
  if (!cmd) return
  switch (action) {
    case 'execute': executeCommand(cmd); break
    case 'copy': navigator.clipboard.writeText(cmd.command).then(() => ElMessage.success('Copied')); break
    case 'delete': cmdStore.deleteEntry(cmd.id); break
  }
}
</script>

<style lang="scss" scoped>
.cmd-history-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background-color: $color-bg-app;
}

.history-header {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 $spacing-md;
  border-bottom: 1px solid $color-border-light;
  flex-shrink: 0;
  background-color: $color-bg-toolbar;
}

.header-left {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  color: $color-text-primary;

  .header-title {
    font-size: $font-size-sm;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.server-select {
  width: 200px;
}

.current-server-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px $spacing-md;
  font-size: 11px;
  font-family: $font-family-mono;
  color: $color-text-secondary;
  background-color: rgba(76, 175, 125, 0.06);
  border-bottom: 1px solid rgba(76, 175, 125, 0.12);
  flex-shrink: 0;

  .live-badge {
    font-size: 9px;
    font-weight: 700;
    color: $color-success;
    background: rgba(76, 175, 125, 0.12);
    padding: 0 5px;
    border-radius: 2px;
    letter-spacing: 0.5px;
  }
}

.command-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-sm 0;
}

.command-item {
  padding: 6px $spacing-md;
  cursor: pointer;
  transition: background-color $transition-fast;
  border-left: 2px solid transparent;

  &:hover {
    background-color: $color-bg-hover;
    border-left-color: $color-primary;
  }
}

.cmd-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: 2px;
}

.cmd-time {
  font-size: 10px;
  color: $color-info;
  font-family: $font-family-mono;
}

.cmd-cwd {
  font-size: 10px;
  color: $color-text-placeholder;
  font-family: $font-family-mono;

  &::before { content: 'in '; }
}

.cmd-text {
  code {
    font-family: $font-family-mono;
    font-size: $font-size-sm;
    color: $color-text-primary;
    background: transparent;
    word-break: break-all;
  }
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: $spacing-sm;
  color: $color-text-secondary;

  p { font-size: $font-size-md; }
  .sub { font-size: $font-size-sm; color: $color-text-placeholder; }
}
</style>
