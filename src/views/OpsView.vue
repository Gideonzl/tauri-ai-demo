<!-- OpsView — 智能运维主视图：巡检 / 批量 / 告警 / 日志 -->
<template>
  <div class="ops-view" @contextmenu.prevent>
    <!-- 顶部栏 -->
    <div class="ops-header">
      <div class="ops-hero">
        <div class="ops-orb"><el-icon :size="18"><Odometer /></el-icon></div>
        <div>
          <div class="ops-eyebrow">NEON OPS CENTER</div>
          <div class="ops-title">
            <span>{{ t('ops.title') }}</span>
          </div>
        </div>
      </div>
      <div class="ops-header-right">
        <div class="ops-tabs">
          <button v-for="tab in tabs" :key="tab.id" class="ops-tab" :class="{ active: activeTab === tab.id }" @click="activeTab = tab.id">
            <el-icon :size="14"><component :is="tab.icon" /></el-icon>
            <span class="ops-tab-label">{{ tab.label }}</span>
            <span v-if="tab.id === 'alerts' && alertStore.unreadCount > 0" class="tab-badge">{{ alertStore.unreadCount }}</span>
          </button>
        </div>
        <!-- 服务器选择器（巡检/告警/日志用）— 显示全部服务器，选中后按需连接 -->
        <div v-if="needsSelector" class="ops-server-select">
          <el-select v-model="selectedServerId" size="small" :placeholder="t('ops.selectServer')" :popper-append-to-body="false" style="width: 220px">
            <el-option v-for="s in sshStore.servers" :key="s.id" :label="s.name" :value="s.id">
              <span class="opt-dot" :class="serverConn(s.id)"></span>{{ s.name }}
            </el-option>
          </el-select>
          <span v-if="connecting" class="ops-connecting"><el-icon :size="12" class="spin"><Loading /></el-icon></span>
        </div>
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
.ops-view {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  background:
    radial-gradient(circle at 18% 0%, $color-bg-active, transparent 32%),
    radial-gradient(circle at 78% 14%, $color-bg-hover, transparent 30%),
    $shell-workspace-bg;
}

.ops-header {
  display: flex; align-items: center; justify-content: space-between; gap: $spacing-lg;
  min-height: 82px; padding: 14px 18px; flex-shrink: 0;
  border-bottom: 1px solid $color-border;
  background:
    linear-gradient(90deg, $color-bg-active, transparent 48%, $color-bg-hover),
    $surface-contrast;
  backdrop-filter: blur(8px);
  box-shadow: none;
}

.ops-hero {
  display: flex; align-items: center; gap: 12px; min-width: 210px;
}

.ops-orb {
  width: 42px; height: 42px; border-radius: 16px;
  display: flex; align-items: center; justify-content: center;
  color: $color-bg-app;
  background: linear-gradient(135deg, $neon-cyan, $neon-violet);
  box-shadow: $glow-soft;
}

.ops-eyebrow {
  font-size: 9px; letter-spacing: 1.8px; color: $color-primary; font-weight: 800;
  text-shadow: $text-shadow-strong;
}

.ops-title {
  display: flex; align-items: center; gap: 6px; margin-top: 3px;
  font-size: 20px; font-weight: 850; color: $color-text-primary;
  letter-spacing: -0.5px;
  text-shadow: $text-shadow-strong;
}

.ops-header-right {
  display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1; justify-content: flex-end;
}

.ops-tabs {
  display: flex; gap: 7px; min-width: 0; overflow-x: auto;
  padding: 5px; border: 1px solid $color-border; border-radius: 999px;
  background: $surface-contrast-soft;
}

.ops-tab {
  display: flex; align-items: center; gap: 5px; position: relative;
  padding: 7px 12px; border: 1px solid transparent; background: transparent; cursor: pointer;
  font-size: $font-size-sm; color: $color-text-regular; font-family: inherit;
  border-radius: 999px; transition: all $transition-fast;
  white-space: nowrap;
  text-shadow: $text-shadow-strong;

  &:hover { color: $color-text-primary; background: $color-bg-hover; border-color: $color-border-focus; }
  &.active {
    color: $color-primary;
    background: $color-bg-active;
    border-color: $color-border-focus;
    box-shadow: none;
  }
}

.ops-tab-label {
  font-weight: 650;
}

.tab-badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 15px; height: 15px; line-height: 15px; padding: 0 4px;
  font-size: 9px; font-weight: 700; color: #fff;
  background: $color-danger; border-radius: 8px; text-align: center; box-shadow: $glow-danger;
}

.ops-server-select {
  flex-shrink: 0; display: flex; align-items: center; gap: 6px;
  padding: 5px; border-radius: 999px; background: $surface-contrast-soft;
  border: 1px solid $color-border;
  box-shadow: none;
}
.opt-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; background: $color-text-muted;
  &.connected { background: $color-success; } &.disconnected { background: $color-text-muted; }
}
.ops-connecting { color: $color-warning; display: inline-flex; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.ops-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0;
  padding: 12px;
}

.ops-empty {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: $color-text-regular;
  .el-icon { color: $color-text-muted; opacity: 0.4; }
  p { margin: 0; font-size: $font-size-md; }
  .sub { font-size: $font-size-sm; color: $color-text-placeholder; }
}
</style>
