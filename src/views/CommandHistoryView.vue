<template>
  <div class="operation-history" @contextmenu.prevent>
    <header class="history-header">
      <div class="header-title">
        <el-icon :size="15"><Clock /></el-icon>
        <span>{{ t('operationHistory.title') }}</span>
        <small>{{ filteredRecords.length }}</small>
      </div>
      <div class="header-tools">
        <el-input
          v-model="searchQuery"
          class="history-search"
          size="small"
          clearable
          :placeholder="t('operationHistory.search')"
        />
        <el-select
          v-model="selectedServerId"
          class="server-select"
          size="small"
          :placeholder="t('operationHistory.selectServer')"
          :popper-append-to-body="false"
        >
          <el-option
            v-for="server in visibleHistoryServers"
            :key="server.serverId"
            :label="server.serverName"
            :value="server.serverId"
          />
        </el-select>
        <button class="icon-action" :title="t('common.refresh')" @click="handleRefresh">
          <el-icon :size="14"><Refresh /></el-icon>
        </button>
        <button v-if="selectedServerId" class="icon-action danger" :title="t('common.clear')" @click="clearCurrent">
          <el-icon :size="14"><Delete /></el-icon>
        </button>
      </div>
    </header>

    <div v-if="activeServer && selectedServerId === activeServer.id" class="current-server">
      <span class="live-dot"></span>
      <span>{{ activeServer.username }}@{{ activeServer.host }}:{{ activeServer.port }}</span>
      <span>LIVE</span>
    </div>

    <main v-if="filteredRecords.length" class="record-list">
      <article
        v-for="record in filteredRecords"
        :key="record.id"
        class="record"
        :class="{ expanded: expandedRecordId === record.id }"
        @contextmenu.prevent="showMenu($event, record)"
      >
        <button class="record-summary" @click="toggleRecord(record.id)">
          <span class="status-dot" :class="record.status"></span>
          <code>{{ record.command }}</code>
          <span v-if="record.durationMs != null" class="duration">{{ formatDuration(record.durationMs) }}</span>
          <span class="status-label">{{ statusLabel(record) }}</span>
          <time>{{ formatTime(record.startedAt) }}</time>
        </button>

        <div v-if="expandedRecordId === record.id" class="record-detail">
          <div v-if="record.cwd" class="record-meta">{{ record.cwd }}</div>
          <pre :class="{ muted: !record.output }">{{ outputLabel(record) }}</pre>
          <div v-if="record.truncated" class="truncated">{{ t('operationHistory.outputTruncated') }}</div>
          <nav class="record-actions" :aria-label="t('operationHistory.actions')">
            <button @click="sendRecordToAi(record)">{{ t('operationHistory.sendToAi') }}</button>
            <button @click="executeCommand(record)">{{ t('operationHistory.rerun') }}</button>
            <button @click="saveAsSnapshot(record)">{{ t('operationHistory.saveRecipe') }}</button>
            <button @click="copyRecord(record)">{{ t('common.copy') }}</button>
            <button class="danger" @click="deleteRecord(record.id)">{{ t('workspace.delete') }}</button>
          </nav>
        </div>
      </article>
    </main>

    <div v-else class="empty-state">
      <el-icon :size="34"><Clock /></el-icon>
      <strong>{{ selectedServerId ? t('operationHistory.empty') : t('operationHistory.selectServer') }}</strong>
      <span>{{ t('operationHistory.emptyHint') }}</span>
    </div>

    <div v-if="menu.visible" class="ctx-menu" :style="{ left: menu.x + 'px', top: menu.y + 'px' }">
      <div class="ctx-item" @click="menuAct('ai')"><el-icon :size="13"><ChatDotRound /></el-icon><span>{{ t('operationHistory.sendToAi') }}</span></div>
      <div class="ctx-item" @click="menuAct('execute')"><el-icon :size="13"><VideoPlay /></el-icon><span>{{ t('operationHistory.rerun') }}</span></div>
      <div class="ctx-item" @click="menuAct('snapshot')"><el-icon :size="13"><DocumentCopy /></el-icon><span>{{ t('operationHistory.saveRecipe') }}</span></div>
      <div class="ctx-item" @click="menuAct('copy')"><el-icon :size="13"><CopyDocument /></el-icon><span>{{ t('common.copy') }}</span></div>
      <div class="ctx-sep"></div>
      <div class="ctx-item danger" @click="menuAct('delete')"><el-icon :size="13"><Delete /></el-icon><span>{{ t('workspace.delete') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, onActivated, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ChatDotRound, Clock, CopyDocument, Delete, DocumentCopy, Refresh, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useOperationRecordsStore } from '@/stores/operationRecords'
import { useWorkflowSnapshotsStore } from '@/stores/workflowSnapshots'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { formatOperationForAi, type OperationRecord } from '@/utils/operation-records'

const operationStore = useOperationRecordsStore()
const snapshotsStore = useWorkflowSnapshotsStore()
const sshStore = useSshStore()
const router = useRouter()
const { t } = useLocale()
const sendTerminalToAI = inject<(text: string, serverInfo?: string) => Promise<boolean>>('sendTerminalToAI')

const selectedServerId = ref('')
const searchQuery = ref('')
const expandedRecordId = ref('')
const menu = reactive({ visible: false, x: 0, y: 0, record: null as OperationRecord | null })

const activeServer = computed(() => {
  const session = sshStore.activeSession
  return session ? sshStore.servers.find(server => server.id === session.serverId) || null : null
})
const existingServerIds = computed(() => new Set(sshStore.servers.map(server => server.id)))
const visibleHistoryServers = computed(() => operationStore.historyServers.filter(server => existingServerIds.value.has(server.serverId)))
const filteredRecords = computed(() => {
  if (!selectedServerId.value) return []
  const query = searchQuery.value.trim().toLowerCase()
  return operationStore.getEntries(selectedServerId.value).filter(record => !query
    || record.command.toLowerCase().includes(query)
    || record.output.toLowerCase().includes(query))
})

function syncWithServers() {
  operationStore.purgeOrphaned(sshStore.servers.map(server => server.id))
  if (selectedServerId.value && !existingServerIds.value.has(selectedServerId.value)) {
    selectedServerId.value = visibleHistoryServers.value[0]?.serverId || ''
  }
}

function selectPreferredServer() {
  const activeId = sshStore.activeSession?.serverId
  if (activeId && visibleHistoryServers.value.some(server => server.serverId === activeId)) selectedServerId.value = activeId
  else if (!selectedServerId.value) selectedServerId.value = visibleHistoryServers.value[0]?.serverId || ''
}

onMounted(() => {
  document.addEventListener('click', hideMenu)
  syncWithServers()
  selectPreferredServer()
})
onActivated(() => {
  operationStore.reload()
  syncWithServers()
  selectPreferredServer()
})
onUnmounted(() => document.removeEventListener('click', hideMenu))
watch(() => sshStore.servers.length, () => { syncWithServers(); selectPreferredServer() })

function toggleRecord(id: string) {
  expandedRecordId.value = expandedRecordId.value === id ? '' : id
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp)
}

function formatDuration(duration: number) {
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(duration < 10_000 ? 1 : 0)}s`
}

function statusLabel(record: OperationRecord) {
  return t(`operationHistory.${record.status}`)
}

function isLegacy(record: OperationRecord) {
  return record.status === 'unknown' && record.finishedAt === undefined && !record.output
}

function outputLabel(record: OperationRecord) {
  if (record.output) return record.output
  return isLegacy(record) ? t('operationHistory.legacyNoOutput') : t('operationHistory.noOutput')
}

function executeCommand(record: OperationRecord) {
  if (!sshStore.activeSession) {
    navigator.clipboard.writeText(record.command)
    ElMessage.success(t('operationHistory.copied'))
    return
  }
  sshStore.runInTerminal(record.command)
  router.push('/')
  ElMessage.success(t('operationHistory.sentToTerminal'))
}

async function sendRecordToAi(record: OperationRecord) {
  const sent = await sendTerminalToAI?.(formatOperationForAi(record), record.serverName)
  if (sent) ElMessage.success(t('operationHistory.sentToAi'))
}

function saveAsSnapshot(record: OperationRecord) {
  snapshotsStore.createSnapshot({
    title: record.command.slice(0, 48),
    server: { id: record.serverId, name: record.serverName },
    commands: [{ command: record.command, output: record.output, timestamp: record.startedAt }],
    filePaths: record.cwd ? [record.cwd] : [],
  })
  ElMessage.success(t('data.snapshotSaved'))
}

async function copyRecord(record: OperationRecord) {
  await navigator.clipboard.writeText([record.command, record.output].filter(Boolean).join('\n\n'))
  ElMessage.success(t('operationHistory.copied'))
}

function deleteRecord(id: string) {
  operationStore.deleteRecord(id)
  if (expandedRecordId.value === id) expandedRecordId.value = ''
}

function clearCurrent() {
  if (selectedServerId.value) operationStore.clearServer(selectedServerId.value)
}

function handleRefresh() {
  operationStore.reload()
  syncWithServers()
  selectPreferredServer()
}

function showMenu(event: MouseEvent, record: OperationRecord) {
  event.stopPropagation()
  menu.record = record
  menu.x = event.clientX
  menu.y = event.clientY
  menu.visible = true
}

function hideMenu() { menu.visible = false }

function menuAct(action: 'ai' | 'execute' | 'snapshot' | 'copy' | 'delete') {
  const record = menu.record
  hideMenu()
  if (!record) return
  if (action === 'ai') void sendRecordToAi(record)
  else if (action === 'execute') executeCommand(record)
  else if (action === 'snapshot') saveAsSnapshot(record)
  else if (action === 'copy') void copyRecord(record)
  else deleteRecord(record.id)
}
</script>

<style lang="scss" scoped>
.operation-history { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: $color-bg-app; color: $color-text-primary }
.history-header { min-height: 48px; padding: 7px 14px; display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid $color-border-light; background: $color-bg-toolbar }
.header-title, .header-tools { display: flex; align-items: center; gap: 8px }
.header-title { font-size: 13px; font-weight: 650; white-space: nowrap; small { color: $color-text-placeholder; font-weight: 500 } }
.header-tools { min-width: 0 }
.history-search { width: min(260px, 24vw) }
.server-select { width: min(210px, 22vw) }
.icon-action { width: 28px; height: 28px; display: inline-grid; place-items: center; border: 0; border-radius: 6px; color: $color-text-secondary; background: transparent; cursor: pointer; &:hover { color: $color-text-primary; background: $color-bg-hover } &.danger:hover { color: $color-danger } }
.current-server { height: 28px; padding: 0 16px; display: flex; align-items: center; gap: 7px; border-bottom: 1px solid $color-border-light; color: $color-text-secondary; font-size: 11px; .live-dot { width: 6px; height: 6px; border-radius: 50%; background: $color-success } span:last-child { margin-left: auto; color: $color-success; font-weight: 700; font-size: 9px } }
.record-list { flex: 1; overflow: auto; padding: 8px 12px 20px }
.record { border-bottom: 1px solid $color-border-light; &:last-child { border-bottom: 0 } &.expanded { background: $color-bg-hover } }
.record-summary { width: 100%; min-height: 42px; padding: 7px 8px; display: grid; grid-template-columns: 8px minmax(180px, 1fr) auto auto auto; align-items: center; gap: 10px; border: 0; background: transparent; color: inherit; text-align: left; cursor: pointer; code { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 12px/1.5 'JetBrains Mono','Cascadia Code',monospace; color: $color-text-primary } time, .duration, .status-label { color: $color-text-placeholder; font-size: 10px; white-space: nowrap } }
.status-dot { width: 6px; height: 6px; border-radius: 50%; background: $color-text-placeholder; &.success { background: $color-success } &.failed { background: $color-danger } &.interrupted { background: $color-warning } &.running { background: $color-primary } }
.record-detail { margin: 0 8px 9px 26px; padding: 8px 10px 9px; border-left: 2px solid $color-border; .record-meta { margin-bottom: 6px; color: $color-text-placeholder; font-size: 10px } pre { max-height: 280px; margin: 0; overflow: auto; white-space: pre-wrap; word-break: break-word; color: $color-text-secondary; font: 11px/1.65 'JetBrains Mono','Cascadia Code',monospace; &.muted { color: $color-text-placeholder; font-family: inherit } } }
.truncated { margin-top: 6px; color: $color-warning; font-size: 10px }
.record-actions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 4px; button { padding: 3px 7px; border: 0; border-radius: 5px; background: transparent; color: $color-text-secondary; font-size: 11px; cursor: pointer; &:hover { color: $color-primary-light; background: $color-bg-active } &.danger:hover { color: $color-danger } } }
.empty-state { flex: 1; display: grid; place-content: center; justify-items: center; gap: 8px; color: $color-text-placeholder; strong { color: $color-text-secondary; font-size: 13px } span { font-size: 11px } }
@media (max-width: 760px) { .history-header { align-items: flex-start; flex-direction: column } .header-tools { width: 100% } .history-search, .server-select { flex: 1; width: auto } .record-summary { grid-template-columns: 8px minmax(120px, 1fr) auto; .duration, .status-label { display: none } } }
</style>
