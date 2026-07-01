<!-- OpsView — 智能运维主视图：巡检 / 批量 / 告警 / 日志 -->
<template>
  <div class="ops-view" @contextmenu.prevent>
    <!-- 顶部栏 -->
    <div class="ops-header">
      <div class="ops-title">
        <el-icon :size="16"><Odometer /></el-icon>
        <span>{{ t('ops.title') }}</span>
      </div>
      <div class="ops-tabs">
        <button v-for="tab in tabs" :key="tab.id" class="ops-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
          <el-icon :size="13"><component :is="tab.icon" /></el-icon>
          <span>{{ tab.label }}</span>
          <span v-if="tab.id === 'alerts' && alertStore.unreadCount > 0" class="tab-badge">{{ alertStore.unreadCount }}</span>
        </button>
      </div>
      <!-- 服务器选择器（巡检/告警/日志用）— 显示全部服务器，选中后按需连接 -->
      <div v-if="needsSelector" class="ops-server-select">
        <el-select v-model="selectedServerId" size="small" :placeholder="t('ops.selectServer')" :popper-append-to-body="false" style="width: 200px">
          <el-option v-for="s in sshStore.servers" :key="s.id" :label="s.name" :value="s.id">
            <span class="opt-dot" :class="serverConn(s.id)"></span>{{ s.name }}
          </el-option>
        </el-select>
        <span v-if="connecting" class="ops-connecting"><el-icon :size="12" class="spin"><Loading /></el-icon></span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="ops-body">
      <!-- 无服务器提示 -->
      <div v-if="needsSelector && sshStore.servers.length === 0" class="ops-empty">
        <el-icon :size="36"><Connection /></el-icon>
        <p>{{ t('ops.noConnected') }}</p>
        <p class="sub">{{ t('ops.connectHint') }}</p>
      </div>
      <template v-else>
        <OverviewPanel v-if="activeTab === 'overview'" />
        <InspectionPanel v-else-if="activeTab === 'inspection'" :session-id="activeSessionRealId" :server-name="activeServerName" :server-id="activeServerId" />
        <BatchPanel v-else-if="activeTab === 'batch'" />
        <ServicePanel v-else-if="activeTab === 'service'" />
        <AlertsPanel v-else-if="activeTab === 'alerts'" :session-id="activeSessionRealId" :server-name="activeServerName" :server-id="activeServerId" />
        <LogPanel v-else-if="activeTab === 'logs'" :session-id="activeSessionRealId" :server-name="activeServerName" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { Odometer, Connection, DataLine, Files, Bell, Document, Box, Loading } from '@element-plus/icons-vue'
import { useSshStore } from '@/stores/ssh'
import { useAlertStore } from '@/stores/alerts'
import { useLocale } from '@/composables/useLocale'
import { resolveSession } from '@/utils/ops-connect'
import OverviewPanel from '@/views/ops/OverviewPanel.vue'
import InspectionPanel from '@/views/ops/InspectionPanel.vue'
import BatchPanel from '@/views/ops/BatchPanel.vue'
import ServicePanel from '@/views/ops/ServicePanel.vue'
import AlertsPanel from '@/views/ops/AlertsPanel.vue'
import LogPanel from '@/views/ops/LogPanel.vue'

const sshStore = useSshStore()
const alertStore = useAlertStore()
const { t } = useLocale()

const activeTab = ref<'overview' | 'inspection' | 'batch' | 'service' | 'alerts' | 'logs'>('overview')

const tabs = computed(() => [
  { id: 'overview', label: t('ops.tabOverview'), icon: Odometer },
  { id: 'inspection', label: t('ops.tabInspection'), icon: DataLine },
  { id: 'batch', label: t('ops.tabBatch'), icon: Files },
  { id: 'service', label: t('ops.tabService'), icon: Box },
  { id: 'alerts', label: t('ops.tabAlerts'), icon: Bell },
  { id: 'logs', label: t('ops.tabLogs'), icon: Document },
])

// 仅巡检/告警/日志需要单机选择器
const needsSelector = computed(() => ['inspection', 'alerts', 'logs'].includes(activeTab.value))

// 选中的服务器（按 serverId），选中后按需连接得到 realSessionId
const selectedServerId = ref('')
const activeSessionRealId = ref('')
const connecting = ref(false)
const transientIds = new Set<string>()

/** 服务器连接状态点 */
function serverConn(serverId: string): string {
  const sess = sshStore.sessions.find(s => s.serverId === serverId)
  return sess?.status === 'connected' ? 'connected' : 'disconnected'
}

const activeServerId = computed(() => selectedServerId.value)
const activeServerName = computed(() => sshStore.servers.find(s => s.id === selectedServerId.value)?.name || '')

// 确保有可用会话：已连接复用，否则按需连接
async function ensureSession(serverId: string) {
  activeSessionRealId.value = ''
  if (!serverId) return
  const server = sshStore.servers.find(s => s.id === serverId)
  if (!server) return
  const existing = sshStore.sessions.find(s => s.serverId === serverId && s.status === 'connected' && s.realSessionId)
  if (existing?.realSessionId) { activeSessionRealId.value = existing.realSessionId; return }
  connecting.value = true
  const sess = await resolveSession(server)
  connecting.value = false
  if (sess) { activeSessionRealId.value = sess.id; if (sess.transient) transientIds.add(sess.id) }
}

watch(selectedServerId, (id) => ensureSession(id))

// 自动选中第一个服务器（新增服务器后列表实时刷新）
watch(() => sshStore.servers.map(s => s.id).join(','), () => {
  if ((!selectedServerId.value || !sshStore.servers.find(s => s.id === selectedServerId.value)) && sshStore.servers.length > 0) {
    selectedServerId.value = sshStore.servers[0].id
  }
}, { immediate: true })

onMounted(() => { if (sshStore.servers.length === 0) sshStore.init() })
onUnmounted(async () => {
  for (const id of transientIds) { try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(id) } catch {} }
})
</script>

<style lang="scss" scoped>
.ops-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; background: $color-bg-app; }

.ops-header {
  display: flex; align-items: center; gap: $spacing-md;
  height: 48px; padding: 0 $spacing-md; flex-shrink: 0;
  border-bottom: 1px solid $color-border-light;
  background: $glass-bg;
  backdrop-filter: blur(10px);
}

.ops-title {
  display: flex; align-items: center; gap: 6px;
  font-size: $font-size-md; font-weight: 600; color: $color-text-primary;
  .el-icon { color: $color-primary; }
}

.ops-tabs { display: flex; gap: 2px; flex: 1; }

.ops-tab {
  display: flex; align-items: center; gap: 5px; position: relative;
  padding: 5px 12px; border: none; background: transparent; cursor: pointer;
  font-size: $font-size-sm; color: $color-text-secondary; font-family: inherit;
  border-radius: $border-radius-sm; transition: all $transition-fast;

  &:hover { color: $color-text-regular; background: $color-bg-hover; }
  &.active { color: $color-primary; background: $color-bg-active; box-shadow: $glow-soft; }
}

.tab-badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 15px; height: 15px; line-height: 15px; padding: 0 4px;
  font-size: 9px; font-weight: 700; color: #fff;
  background: $color-danger; border-radius: 8px; text-align: center;
}

.ops-server-select { flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
.opt-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: $color-text-muted;
  &.connected { background: $color-success; } &.disconnected { background: $color-text-muted; }
}
.ops-connecting { color: $color-warning; display: inline-flex; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.ops-body { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }

.ops-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; }
  p { margin: 0; font-size: $font-size-md; }
  .sub { font-size: $font-size-sm; color: $color-text-placeholder; }
}
</style>
