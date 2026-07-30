<!-- ServicePanel — 服务运维：跨服务器中间件/业务服务巡检 -->
<template>
  <div class="svc-panel">
    <!-- 左：服务器选择 -->
    <div class="svc-servers">
      <div class="svc-servers-head">
        <span class="svc-servers-title">{{ t('ops.svcSelectServers') }}</span>
        <el-button size="small" text @click="toggleAll">{{ t('ops.batchSelectAll') }}</el-button>
      </div>
      <div class="svc-selection-summary">
        <span><i></i>{{ t('ops.svcSelected', { n: selected.size }) }}</span>
        <span>{{ t('ops.svcConnected', { n: connectedCount }) }}</span>
      </div>
      <div class="svc-server-list">
        <label v-for="s in sshStore.servers" :key="s.id" class="svc-server-item" :class="{ checked: selected.has(s.id) }">
          <input type="checkbox" :checked="selected.has(s.id)" @change="toggle(s.id)" />
          <span class="svc-conn-dot" :class="connStatus(s.id)"></span>
          <div class="svc-server-info">
            <span class="svc-server-name">{{ s.name }}</span>
            <span class="svc-server-addr">{{ s.host }}</span>
          </div>
        </label>
        <div v-if="sshStore.servers.length === 0" class="svc-empty">{{ t('workspace.noHosts') }}</div>
      </div>
    </div>

    <!-- 右：服务选择 + 结果 -->
    <div class="svc-main">
      <!-- 服务选择工具栏 -->
      <div class="svc-toolbar ops-toolbar">
        <div class="svc-chips">
          <button v-for="def in catalog" :key="def.id" class="svc-chip" :class="{ active: services.has(def.id) }" :style="services.has(def.id) ? { borderColor: def.color, color: def.color } : {}" :title="def.hint" @click="toggleService(def.id)">
            <span class="svc-chip-dot" :style="{ background: def.color }"></span>{{ def.name }}
          </button>
          <span v-for="p in customPorts" :key="p" class="svc-chip active port">
            {{ t('ops.svcCustomPort') }} {{ p }}
            <el-icon :size="11" class="svc-chip-x" @click.stop="removePort(p)"><Close /></el-icon>
          </span>
          <el-dropdown trigger="click" @command="addPreset">
            <button class="svc-chip preset-btn"><el-icon :size="12"><Plus /></el-icon>{{ t('ops.svcCommonPorts') }}</button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item v-for="pp in PORT_PRESETS" :key="pp.port" :command="pp.port">{{ pp.label }} <span class="preset-port">:{{ pp.port }}</span></el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <input v-model="portInput" class="svc-port-input" :placeholder="t('ops.svcCustomPortPlaceholder')" @keydown.enter="addPort" />
        </div>
        <div class="svc-actions">
          <el-button type="primary" size="small" :loading="store.running" @click="run">{{ store.running ? t('ops.svcRunning') : t('ops.svcRun') }}</el-button>
          <el-button v-if="store.reports.length" size="small" text type="primary" :loading="aiRunning" @click="analyze">
            <el-icon :size="13" v-if="!aiRunning"><ChatDotRound /></el-icon>{{ t('ops.svcAiAnalyze') }}
          </el-button>
          <el-button v-if="store.reports.length" size="small" @click="copyAll"><el-icon :size="13"><DocumentCopy /></el-icon></el-button>
        </div>
      </div>

      <div class="svc-results" v-if="store.reports.length">
        <!-- 服务总览矩阵 -->
        <div class="svc-overview">
          <div class="svc-ov-head">
            <div>
              <span class="svc-ov-title">{{ t('ops.svcOverview') }}</span>
              <span class="svc-ov-subtitle">{{ t('ops.svcChecked', { servers: store.reports.length, services: matrixCols.length }) }}</span>
            </div>
            <el-icon class="svc-explain-btn" :class="{ active: showLegend }" :title="t('ops.svcExplain')" @click="showLegend = !showLegend"><QuestionFilled /></el-icon>
          </div>
          <div class="svc-status-summary">
            <span class="running"><i></i>{{ serviceSummary.running }} {{ t('ops.svcStatusRunning') }}</span>
            <span class="degraded"><i></i>{{ serviceSummary.degraded }} {{ t('ops.svcStatusDegraded') }}</span>
            <span class="stopped"><i></i>{{ serviceSummary.stopped }} {{ t('ops.svcStatusStopped') }}</span>
            <span class="absent"><i></i>{{ serviceSummary.absent }} {{ t('ops.svcAbsent') }}</span>
          </div>
          <!-- 隐藏式状态说明 -->
          <transition name="legend">
            <div v-if="showLegend" class="svc-legend">
              <div class="lg-item"><span class="lg-dot running"></span><span class="lg-txt">{{ t('ops.svcExplainRunning') }}</span></div>
              <div class="lg-item"><span class="lg-dot degraded"></span><span class="lg-txt">{{ t('ops.svcExplainDegraded') }}</span></div>
              <div class="lg-item"><span class="lg-dot stopped"></span><span class="lg-txt">{{ t('ops.svcExplainStopped') }}</span></div>
              <div class="lg-item"><span class="lg-dot absent"></span><span class="lg-txt">{{ t('ops.svcExplainAbsent') }}</span></div>
            </div>
          </transition>
          <div class="svc-matrix">
            <table>
              <thead>
                <tr>
                  <th class="mx-corner"></th>
                  <th v-for="col in matrixCols" :key="col.id">{{ col.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rep in sortedReports" :key="rep.serverId">
                  <td class="mx-server">{{ rep.serverName }}</td>
                  <td v-for="col in matrixCols" :key="col.id" class="mx-cell">
                    <span class="mx-dot" :class="cellStatus(rep, col.id)" :title="cellTitle(rep, col.id)" :aria-label="cellTitle(rep, col.id)"></span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 每台服务器详情 -->
        <div v-for="rep in sortedReports" :key="rep.serverId" class="svc-server-card" :class="{ flagged: reportIssueCount(rep) > 0, failed: rep.status === 'failed' }">
          <button type="button" class="svc-card-head" @click="toggleServer(rep.serverId)">
            <span class="svc-conn-dot" :class="rep.status === 'done' ? 'connected' : rep.status === 'failed' ? 'error' : 'connecting'"></span>
            <span class="svc-card-name">{{ rep.serverName }}</span>
            <span class="svc-card-meta">{{ reportIssueCount(rep) ? t('ops.svcIssues', { n: reportIssueCount(rep) }) : t('ops.svcHealthy') }}</span>
            <span class="svc-card-summary">
              <i class="running">{{ reportCounts(rep).running }}</i>
              <i class="degraded">{{ reportCounts(rep).degraded + reportCounts(rep).stopped }}</i>
              <i class="absent">{{ reportCounts(rep).absent }}</i>
            </span>
            <el-icon :size="14" class="svc-card-toggle"><ArrowUp v-if="isServerExpanded(rep.serverId)" /><ArrowDown v-else /></el-icon>
          </button>
          <div v-if="rep.status === 'failed' && isServerExpanded(rep.serverId)" class="svc-card-error">{{ t('ops.svcCheckFailed') }}</div>
          <div v-else-if="isServerExpanded(rep.serverId)" class="svc-list">
            <div v-for="svc in rep.services" :key="svc.serviceId" class="svc-item" :class="{ absent: !svc.present }">
              <div class="svc-item-head">
                <span class="svc-status-dot" :class="svc.present ? svc.status : 'absent'"></span>
                <span class="svc-item-name">{{ svc.serviceName }}</span>
                <span class="svc-item-status" :class="svc.present ? svc.status : 'absent'" :title="statusExplain(svc)">{{ svc.present ? statusText(svc.status) : t('ops.svcAbsent') }}</span>
              </div>
              <div v-if="svc.present && svc.metrics.length" class="svc-metrics">
                <span v-for="(m, i) in svc.metrics" :key="i" class="svc-metric" :class="m.severity">
                  <span class="sm-label">{{ m.label }}</span><span class="sm-value">{{ m.value }}</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- AI 分析 -->
        <div v-if="aiText || aiRunning" class="svc-ai">
          <div class="svc-ai-head"><span>{{ t('ops.aiReport') }}</span><button type="button" class="svc-ai-close" :title="t('common.close')" @click="dismissAi"><el-icon :size="15"><Close /></el-icon></button></div>
          <div class="svc-ai-body markdown-body" v-html="renderedAi"></div>
        </div>
      </div>
      <OpsEmptyState
        v-else
        :icon="Coin"
        :title="selected.size && services.size + customPorts.length ? t('ops.svcRun') : t('ops.svcSelectFirst')"
        :description="t('ops.svcTipSelect')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ArrowDown, ArrowUp, Close, ChatDotRound, DocumentCopy, Coin, Plus, QuestionFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { useServiceOpsStore, SERVICE_CATALOG } from '@/stores/serviceOps'
import type { ServerServiceReport } from '@/stores/serviceOps'
import { useModelStore } from '@/stores/model'
import { resolveSession, releaseSession } from '@/utils/ops-connect'
import { streamChat } from '@/utils/ai-chat'
import { useLocale } from '@/composables/useLocale'
import { renderMarkdown } from '@/utils/markdown'
import OpsEmptyState from '@/components/OpsEmptyState.vue'

const sshStore = useSshStore()
const store = useServiceOpsStore()
const modelStore = useModelStore()
const { t } = useLocale()

const BRAND: Record<string, string> = {
  redis: '#d82c20', mysql: '#00758f', postgres: '#336791', mongodb: '#47a248', nginx: '#009639', docker: '#2496ed',
}
const HINT_KEY: Record<string, string> = {
  redis: 'ops.svcHintRedis', mysql: 'ops.svcHintMysql', postgres: 'ops.svcHintPostgres',
  mongodb: 'ops.svcHintMongodb', nginx: 'ops.svcHintNginx', docker: 'ops.svcHintDocker',
}
const catalog = SERVICE_CATALOG.map(s => ({ id: s.id, name: s.name, color: BRAND[s.id] || '#7a8a9e', hint: t(HINT_KEY[s.id] || '') }))

// 常用业务端口预设（小白友好）
const PORT_PRESETS = [
  { label: 'Web / Tomcat', port: 8080 },
  { label: 'Node.js', port: 3000 },
  { label: '开发服务 Dev', port: 8000 },
  { label: 'Vite/前端', port: 5173 },
  { label: 'Elasticsearch', port: 9200 },
  { label: 'RabbitMQ 管理', port: 15672 },
  { label: 'Kafka', port: 9092 },
  { label: 'Prometheus', port: 9090 },
  { label: 'Grafana', port: 3001 },
  { label: 'MinIO', port: 9000 },
  { label: 'Memcached', port: 11211 },
]

// ── 持久化选择 ──
const SEL_KEY = 'ops-service-selection'
function loadSel(): { services: string[]; ports: number[] } {
  try { const s = localStorage.getItem(SEL_KEY); if (s) return JSON.parse(s) } catch {}
  return { services: ['redis', 'mysql', 'nginx', 'docker'], ports: [] }
}
const _init = loadSel()

const selected = reactive(new Set<string>())
const services = reactive(new Set<string>(_init.services))
const customPorts = ref<number[]>(_init.ports)
const portInput = ref('')

function persistSel() {
  try { localStorage.setItem(SEL_KEY, JSON.stringify({ services: Array.from(services), ports: customPorts.value })) } catch {}
}

const aiRunning = ref(false)
const aiText = ref('')
const showLegend = ref(false)
const renderedAi = computed(() => renderMarkdown(aiText.value))
const expandedServers = reactive(new Set<string>())
const connectedCount = computed(() => new Set(
  sshStore.sessions.filter(session => session.status === 'connected' && session.realSessionId).map(session => session.serverId),
).size)

// 矩阵列 = 选中服务 + 自定义端口
const matrixCols = computed(() => [
  ...catalog.filter(c => services.has(c.id)),
  ...customPorts.value.map(p => ({ id: `port-${p}`, name: `:${p}`, color: '#7a8a9e' })),
])

type ServiceSummary = { running: number; degraded: number; stopped: number; absent: number }

function reportCounts(rep: ServerServiceReport): ServiceSummary {
  return rep.services.reduce<ServiceSummary>((counts, service) => {
    if (!service.present) counts.absent += 1
    else if (service.status === 'running') counts.running += 1
    else if (service.status === 'degraded') counts.degraded += 1
    else counts.stopped += 1
    return counts
  }, { running: 0, degraded: 0, stopped: 0, absent: 0 })
}

function reportIssueCount(rep: ServerServiceReport): number {
  const counts = reportCounts(rep)
  return counts.degraded + counts.stopped + (rep.status === 'failed' ? 1 : 0)
}

const serviceSummary = computed(() => store.reports.reduce<ServiceSummary>((summary, rep) => {
  const counts = reportCounts(rep)
  summary.running += counts.running
  summary.degraded += counts.degraded
  summary.stopped += counts.stopped
  summary.absent += counts.absent
  return summary
}, { running: 0, degraded: 0, stopped: 0, absent: 0 }))

const sortedReports = computed(() => [...store.reports].sort((left, right) => {
  const leftRank = left.status === 'failed' ? 0 : reportIssueCount(left) > 0 ? 1 : 2
  const rightRank = right.status === 'failed' ? 0 : reportIssueCount(right) > 0 ? 1 : 2
  return leftRank - rightRank || left.serverName.localeCompare(right.serverName)
}))

function toggle(id: string) { selected.has(id) ? selected.delete(id) : selected.add(id) }
function toggleAll() { if (selected.size === sshStore.servers.length) selected.clear(); else sshStore.servers.forEach((s: any) => selected.add(s.id)) }
function toggleService(id: string) { services.has(id) ? services.delete(id) : services.add(id); persistSel() }
function addPort() {
  const p = parseInt(portInput.value)
  if (p > 0 && p < 65536 && !customPorts.value.includes(p)) { customPorts.value.push(p); persistSel() }
  portInput.value = ''
}
function addPreset(port: number) {
  if (!customPorts.value.includes(port)) { customPorts.value.push(port); persistSel() }
}
function removePort(p: number) { customPorts.value = customPorts.value.filter(x => x !== p); persistSel() }

function connStatus(serverId: string): string {
  const sess = sshStore.sessions.find(s => s.serverId === serverId)
  return sess?.status === 'connected' ? 'connected' : 'disconnected'
}
function statusText(s: string): string {
  return { running: t('ops.svcStatusRunning'), stopped: t('ops.svcStatusStopped'), degraded: t('ops.svcStatusDegraded'), unknown: t('ops.svcStatusUnknown') }[s] || s
}
function statusExplain(svc: any): string {
  if (!svc.present) return t('ops.svcExplainAbsent')
  return { running: t('ops.svcExplainRunning'), degraded: t('ops.svcExplainDegraded'), stopped: t('ops.svcExplainStopped') }[svc.status as string] || ''
}
function cellStatus(rep: ServerServiceReport, svcId: string): string {
  const svc = rep.services.find(s => s.serviceId === svcId)
  if (!svc || !svc.present) return 'absent'
  return svc.status
}
function cellTitle(rep: ServerServiceReport, svcId: string): string {
  const svc = rep.services.find(s => s.serviceId === svcId)
  if (!svc || !svc.present) return t('ops.svcAbsent')
  return statusText(svc.status)
}
function toggleServer(serverId: string) { expandedServers.has(serverId) ? expandedServers.delete(serverId) : expandedServers.add(serverId) }
function isServerExpanded(serverId: string): boolean { return expandedServers.has(serverId) }
function revealIssues() {
  expandedServers.clear()
  store.reports.forEach(rep => { if (reportIssueCount(rep) > 0) expandedServers.add(rep.serverId) })
}

async function run() {
  if (selected.size === 0 || (services.size === 0 && customPorts.value.length === 0)) {
    ElMessage.warning(t('ops.svcSelectFirst')); return
  }
  store.running = true
  aiText.value = ''
  expandedServers.clear()
  const targets = sshStore.servers.filter((s: any) => selected.has(s.id))
  const svcIds = Array.from(services)
  store.reports = targets.map((s: any) => ({ serverId: s.id, serverName: s.name, status: 'running' as const, services: [] }))

  await Promise.all(targets.map(async (server: any, idx: number) => {
    const rep = store.reports[idx]
    const sess = await resolveSession(server)
    if (!sess) { rep.status = 'failed'; return }
    try {
      rep.services = await store.checkServer(sess.id, svcIds, customPorts.value)
      rep.status = 'done'
    } catch { rep.status = 'failed' }
    finally { await releaseSession(sess) }
  }))
  store.running = false
  store.saveReports()
  revealIssues()
}

async function analyze() {
  if (!store.reports.length) return
  if (!modelStore.defaultConfig) { ElMessage.warning(t('ai.pleaseConfig')); return }
  aiRunning.value = true
  aiText.value = ''
  const agent = { id: 'ops-service', name: 'Service', description: '', systemPrompt: '你是一名资深运维专家，擅长 Redis/MySQL/PostgreSQL/MongoDB/Nginx/Docker 等中间件与服务的健康评估和故障排查。' }
  await streamChat(
    agent as any,
    [{ role: 'user', content: store.buildAiPrompt() }],
    (chunk) => { aiText.value += chunk },
    () => { aiRunning.value = false },
    (err) => { aiRunning.value = false; ElMessage.error(err) },
    { serverName: 'fleet', host: '', port: 22, username: '', status: 'connected' },
    null, undefined, 'qa'
  )
}

function copyAll() {
  navigator.clipboard.writeText(store.buildAiPrompt())
  ElMessage.success(t('sftp.copied'))
}

function dismissAi() { aiText.value = ''; aiRunning.value = false }

onMounted(() => revealIssues())
</script>

<style lang="scss" scoped>
.svc-panel { flex: 1; display: flex; overflow: hidden; min-height: 0; background: $shell-workspace-bg; }

// 左侧服务器
.svc-servers { width: 230px; flex-shrink: 0; border-right: 1px solid $color-border-light; display: flex; flex-direction: column; min-height: 0; background: $color-bg-surface; }
.svc-servers-head { display: flex; align-items: center; justify-content: space-between; padding: $spacing-sm $spacing-md 5px; border-bottom: 0;
  .svc-servers-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }
}
.svc-selection-summary { display: flex; justify-content: space-between; gap: 6px; padding: 0 $spacing-md $spacing-sm; border-bottom: 1px solid $color-border-light; color: $color-text-placeholder; font-size: 10px;
  span { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  i { width: 6px; height: 6px; border-radius: 50%; background: $color-primary; }
}
.svc-server-list { flex: 1; overflow-y: auto; padding: $spacing-xs; }
.svc-server-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: $border-radius-sm; cursor: pointer; transition: background $transition-fast;
  &:hover { background: $color-bg-hover; } &.checked { background: $color-bg-active; }
  input { cursor: pointer; accent-color: var(--color-primary, #5b8def); }
}
.svc-conn-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: $color-text-muted;
  &.connected { background: $color-success; } &.error { background: $color-danger; } &.connecting { background: $color-warning; }
}
.svc-server-info { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.svc-server-name { font-size: $font-size-sm; color: $color-text-primary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svc-server-addr { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }
.svc-empty { padding: $spacing-md; text-align: center; font-size: $font-size-xs; color: $color-text-placeholder; }

// 右侧
.svc-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; }
.svc-toolbar { display: flex; align-items: flex-start; gap: $spacing-sm; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; flex-wrap: wrap; flex-shrink: 0; }
.svc-chips { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; flex: 1; }
.svc-chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px;
  border: 1px solid $color-border; border-radius: 14px; background: $color-bg-input;
  cursor: pointer; font-family: inherit; font-size: $font-size-xs; color: $color-text-secondary; transition: all $transition-fast;
  &:hover { border-color: $color-primary; }
  &.active { background: $color-bg-active; font-weight: 600; }
  &.port { border-color: $color-primary; color: $color-primary; }
}
.svc-chip-dot { width: 8px; height: 8px; border-radius: 50%; }
.svc-chip-x { cursor: pointer; &:hover { color: $color-danger; } }
.svc-port-input {
  width: 130px; padding: 4px 10px; border: 1px dashed $color-border; border-radius: 14px;
  background: transparent; color: $color-text-primary; font-size: $font-size-xs; outline: none; font-family: inherit;
  &:focus { border-color: $color-primary; }
}
.preset-btn { border-style: dashed; color: $color-primary; gap: 3px;
  &:hover { background: $color-bg-active; }
}
.preset-port { color: $color-text-placeholder; font-family: $font-family-mono; margin-left: 4px; }
.svc-actions { display: flex; align-items: center; gap: 6px; }

.svc-results { flex: 1; overflow-y: auto; padding: $spacing-md; display: flex; flex-direction: column; gap: $spacing-md; min-height: 0; }
.svc-results > * { flex-shrink: 0; }

// 总览矩阵
.svc-overview { border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1; padding: $spacing-sm $spacing-md; }
.svc-ov-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 6px; margin-bottom: 8px; }
.svc-ov-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }
.svc-ov-subtitle { display: block; margin-top: 3px; color: $color-text-placeholder; font-size: 10px; }
.svc-explain-btn { cursor: pointer; color: $color-text-muted; transition: color $transition-fast;
  &:hover, &.active { color: $color-primary; }
}
.svc-status-summary { display: flex; flex-wrap: wrap; gap: 6px 12px; padding: 7px 0 10px; font-size: 10px; color: $color-text-secondary;
  span { display: inline-flex; align-items: center; gap: 4px; } i { width: 6px; height: 6px; border-radius: 50%; background: $color-success; }
  .degraded i { background: $color-warning; } .stopped i { background: $color-danger; } .absent i { background: $color-border; }
}
.svc-legend { display: flex; flex-direction: column; gap: 5px; padding: 8px 10px; margin-bottom: 10px; border-radius: $border-radius-sm; background: $color-bg-hover; border: 1px solid $color-border-light; }
.lg-item { display: flex; align-items: flex-start; gap: 8px; }
.lg-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
  &.running { background: $color-success; } &.degraded { background: $color-warning; }
  &.stopped { background: $color-danger; } &.absent { background: $color-border; }
}
.lg-txt { font-size: $font-size-xs; color: $color-text-secondary; line-height: 1.4; }
.legend-enter-active, .legend-leave-active { transition: opacity 0.2s ease, transform 0.2s ease; }
.legend-enter-from, .legend-leave-to { opacity: 0; transform: translateY(-4px); }
.svc-matrix { overflow-x: auto;
  table { border-collapse: collapse; font-size: $font-size-xs; }
  th, td { padding: 5px 10px; text-align: center; }
  th { color: $color-text-secondary; font-weight: 600; white-space: nowrap; }
  .mx-corner { width: 100px; }
  .mx-server { text-align: left; color: $color-text-primary; font-weight: 500; white-space: nowrap; }
}
.mx-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: $color-text-muted;
  &.running { background: $color-success; box-shadow: 0 0 5px rgba(76,175,125,0.5); }
  &.degraded { background: $color-warning; }
  &.stopped { background: $color-danger; }
  &.absent { background: $color-border; opacity: 0.5; }
}

// 服务器详情卡
.svc-server-card { border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1; overflow: hidden; animation: fade-in-up 0.25s ease;
  &.flagged { border-left: 3px solid $color-warning; } &.failed { border-left-color: $color-danger; }
}
.svc-card-head { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 12px; border: 0; border-bottom: 1px solid $color-border-light; background: transparent; text-align: left; cursor: pointer; font: inherit;
  &:hover { background: $color-bg-hover; }
  .svc-card-name { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
.svc-card-meta { margin-left: auto; color: $color-text-secondary; font-size: 10px; white-space: nowrap; }
.svc-card-summary { display: inline-flex; align-items: center; gap: 4px;
  i { min-width: 16px; padding: 1px 4px; border-radius: 4px; color: $color-success; background: $color-bg-success-hover; font-style: normal; text-align: center; font-family: $font-family-mono; font-size: 9px; }
  .degraded { color: $color-warning; background: $color-bg-warning-hover; } .absent { color: $color-text-muted; background: $color-bg-input; }
}
.svc-card-toggle { color: $color-text-secondary; flex-shrink: 0; }
.svc-card-error { padding: 12px; color: $color-danger; background: $color-bg-danger-hover; font-size: $font-size-xs; }
.svc-list { display: flex; flex-direction: column; }
.svc-item { padding: 8px 12px; border-bottom: 1px solid $color-border-light;
  &:last-child { border-bottom: none; } &.absent { opacity: 0.5; }
}
.svc-item-head { display: flex; align-items: center; gap: 8px; }
.svc-status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; background: $color-text-muted;
  &.running { background: $color-success; } &.degraded { background: $color-warning; } &.stopped { background: $color-danger; } &.absent { background: $color-border; }
}
.svc-item-name { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex: 1; }
.svc-item-status { font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 3px;
  &.running { color: $color-success; background: $color-bg-success-hover; }
  &.degraded { color: $color-warning; background: $color-bg-warning-hover; }
  &.stopped { color: $color-danger; background: $color-bg-danger-hover; }
  &.absent { color: $color-text-muted; background: $color-bg-input; }
}
.svc-metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 7px; padding-left: 16px; }
.svc-metric { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 2px 8px; border-radius: $border-radius-sm; background: $color-bg-input;
  .sm-label { color: $color-text-secondary; }
  .sm-value { color: $color-text-primary; font-family: $font-family-mono; font-weight: 600; }
  &.warning .sm-value { color: $color-warning; }
  &.critical .sm-value { color: $color-danger; }
}

.svc-ai { border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1; overflow: hidden; }
.svc-ai-head { display: flex; align-items: center; justify-content: space-between; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex-shrink: 0; }
.svc-ai-close { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border: 0; border-radius: 6px; background: transparent; color: $color-text-secondary; cursor: pointer;
  &:hover { color: $color-danger; background: $color-bg-danger-hover; }
}
.svc-ai-body { padding: $spacing-md; font-size: $font-size-sm; line-height: 1.62; color: $color-text-primary; max-height: 46vh; overflow-y: auto;
  &::-webkit-scrollbar { width: 6px; } &::-webkit-scrollbar-thumb { background: $color-border; border-radius: 3px; }
}

.svc-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
  .svc-tip { font-size: $font-size-xs; color: $color-text-placeholder; }
}

@media (max-width: 980px) {
  .svc-panel { flex-direction: column; }
  .svc-servers { width: auto; max-height: 215px; border-right: 0; border-bottom: 1px solid $color-border-light; }
  .svc-server-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 3px; }
}

@media (max-width: 620px) {
  .svc-toolbar { align-items: stretch; }
  .svc-actions { justify-content: flex-end; }
  .svc-card-meta { display: none; }
  .svc-card-summary { margin-left: auto; }
  .svc-status-summary { gap: 5px 9px; }
}
</style>
