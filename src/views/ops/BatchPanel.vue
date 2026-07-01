<!-- BatchPanel — 批量运维：多服务器巡检 / 命令 -->
<template>
  <div class="batch-panel">
    <!-- 左：服务器选择 -->
    <div class="bp-servers">
      <div class="bp-servers-head">
        <span class="bp-servers-title">{{ t('ops.batchServers') }}</span>
        <el-button size="small" text @click="toggleAll">{{ t('ops.batchSelectAll') }}</el-button>
      </div>
      <div class="bp-server-list">
        <label v-for="s in sshStore.servers" :key="s.id" class="bp-server-item" :class="{ checked: selected.has(s.id) }">
          <input type="checkbox" :checked="selected.has(s.id)" @change="toggle(s.id)" />
          <span class="bp-conn-dot" :class="connStatus(s.id)"></span>
          <div class="bp-server-info">
            <span class="bp-server-name">{{ s.name }}</span>
            <span class="bp-server-addr">{{ s.username }}@{{ s.host }}</span>
          </div>
        </label>
        <div v-if="sshStore.servers.length === 0" class="bp-empty">{{ t('workspace.noHosts') }}</div>
      </div>
    </div>

    <!-- 右：任务 + 结果 -->
    <div class="bp-main">
      <div class="bp-taskbar">
        <div class="bp-task-toggle">
          <button class="bp-task-btn" :class="{ active: taskType === 'inspect' }" @click="taskType = 'inspect'">{{ t('ops.batchTaskInspect') }}</button>
          <button class="bp-task-btn" :class="{ active: taskType === 'command' }" @click="taskType = 'command'">{{ t('ops.batchTaskCommand') }}</button>
        </div>
        <el-input v-if="taskType === 'command'" v-model="command" size="small" :placeholder="t('ops.batchCommandPlaceholder')" class="bp-cmd-input" @keydown.enter="run" />
        <el-button type="primary" size="small" :loading="running" :disabled="running" @click="run">
          {{ running ? t('ops.batchRunning') : t('ops.batchRun') }}
        </el-button>
        <el-button v-if="results.length" size="small" @click="copyAll">
          <el-icon :size="13"><DocumentCopy /></el-icon>{{ t('ops.batchCopyAll') }}
        </el-button>
      </div>

      <div class="bp-results" v-if="results.length">
        <!-- 巡检对比表 -->
        <div v-if="taskType === 'inspect'" class="bp-compare">
          <div v-for="r in results" :key="r.serverId" class="bp-compare-row" :class="r.status">
            <span class="bp-cmp-name">{{ r.serverName }}</span>
            <template v-if="r.status === 'done' && r.score !== undefined">
              <div class="bp-cmp-bar"><div class="bp-cmp-fill" :style="{ width: r.score + '%', background: scoreColor(r.score) }"></div></div>
              <span class="bp-cmp-score" :style="{ color: scoreColor(r.score) }">{{ r.score }}</span>
              <span class="bp-cmp-counts"><span class="crit" v-if="r.critical">{{ r.critical }}严重</span><span class="warn" v-if="r.warning">{{ r.warning }}警告</span></span>
            </template>
            <span v-else class="bp-cmp-status" :class="r.status">{{ statusText(r.status) }}</span>
          </div>
        </div>
        <!-- 命令输出卡片 -->
        <div v-else class="bp-cmd-results">
          <div v-for="r in results" :key="r.serverId" class="bp-cmd-card" :class="r.status">
            <div class="bp-cmd-head">
              <span class="bp-conn-dot" :class="r.status === 'done' ? 'connected' : r.status === 'failed' ? 'error' : 'connecting'"></span>
              <span class="bp-cmd-server">{{ r.serverName }}</span>
              <span class="bp-cmd-badge" :class="r.status">{{ statusText(r.status) }}</span>
            </div>
            <pre v-if="r.output" class="bp-cmd-output">{{ r.output }}</pre>
          </div>
        </div>
      </div>
      <div v-else class="bp-placeholder">
        <el-icon :size="36"><Files /></el-icon>
        <p>{{ selected.size ? t('ops.batchRun') : t('ops.batchSelectFirst') }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { DocumentCopy, Files } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useSshStore } from '@/stores/ssh'
import { useInspectionStore } from '@/stores/inspection'
import { useLocale } from '@/composables/useLocale'

const sshStore = useSshStore()
const inspection = useInspectionStore()
const { t } = useLocale()

const selected = reactive(new Set<string>())
const taskType = ref<'inspect' | 'command'>('inspect')
const command = ref('')
const running = ref(false)

interface BatchResult {
  serverId: string; serverName: string
  status: 'connecting' | 'running' | 'done' | 'failed'
  output?: string; score?: number; critical?: number; warning?: number
}
const results = ref<BatchResult[]>([])

const DANGER = /\b(rm\s+-rf|mkfs|dd\s+if=|reboot|shutdown|halt|iptables\s+-F|drop\s+database|>\s*\/dev\/(sd|nvme))/i

function toggle(id: string) { selected.has(id) ? selected.delete(id) : selected.add(id) }
function toggleAll() {
  if (selected.size === sshStore.servers.length) selected.clear()
  else sshStore.servers.forEach(s => selected.add(s.id))
}
function connStatus(serverId: string): string {
  const sess = sshStore.sessions.find(s => s.serverId === serverId)
  return sess?.status === 'connected' ? 'connected' : 'disconnected'
}
function statusText(s: string): string {
  if (s === 'connecting') return t('ops.batchConnecting')
  if (s === 'running') return t('ops.batchRunning')
  if (s === 'done') return t('ops.batchSuccess')
  return t('ops.batchFailed')
}
function scoreColor(s: number): string {
  if (s >= 85) return 'var(--color-success, #4caf7d)'
  if (s >= 60) return 'var(--chart-cpu-warning, #e69138)'
  return 'var(--color-danger, #d45454)'
}

/** 取得可用 sessionId：已连接则复用，否则临时连接。返回 {id, transient} */
async function resolveSession(server: any): Promise<{ id: string; transient: boolean } | null> {
  const existing = sshStore.sessions.find(s => s.serverId === server.id && s.status === 'connected' && s.realSessionId)
  if (existing?.realSessionId) return { id: existing.realSessionId, transient: false }
  try {
    const { sshConnect } = await import('@/api/tauri')
    const res = await sshConnect({
      host: server.host, port: server.port, username: server.username,
      auth: server.authType === 'password' ? { type: 'password', password: server.password || '' } : { type: 'private_key', key_path: server.keyPath || '' },
      timeout_ms: 10000, remark: '', pinned: false,
    })
    return { id: res.session_id, transient: true }
  } catch { return null }
}

async function run() {
  if (selected.size === 0) { ElMessage.warning(t('ops.batchSelectFirst')); return }
  if (taskType.value === 'command') {
    if (!command.value.trim()) return
    if (DANGER.test(command.value)) {
      try { await ElMessageBox.confirm(t('ops.batchDangerConfirm', { n: selected.size }), t('common.confirm'), { type: 'warning' }) } catch { return }
    }
  }

  running.value = true
  const targets = sshStore.servers.filter(s => selected.has(s.id))
  results.value = targets.map(s => ({ serverId: s.id, serverName: s.name, status: 'connecting' as const }))

  await Promise.all(targets.map(async (server, idx) => {
    const slot = results.value[idx]
    const sess = await resolveSession(server)
    if (!sess) { slot.status = 'failed'; slot.output = 'Connection failed'; return }
    slot.status = 'running'
    try {
      if (taskType.value === 'inspect') {
        const rep = await inspection.runInspection(sess.id, server.name, server.id)
        slot.score = rep.healthScore
        slot.critical = rep.findings.filter(f => f.severity === 'critical').length
        slot.warning = rep.findings.filter(f => f.severity === 'warning').length
        slot.status = 'done'
      } else {
        const { sshExec } = await import('@/api/tauri')
        slot.output = (await sshExec(sess.id, command.value)).trim() || '(no output)'
        slot.status = 'done'
      }
    } catch (e: any) {
      slot.status = 'failed'; slot.output = e?.message || String(e)
    } finally {
      if (sess.transient) { try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(sess.id) } catch {} }
    }
  }))

  running.value = false
}

function copyAll() {
  const text = results.value.map(r => {
    if (taskType.value === 'inspect') return `${r.serverName}: 健康分 ${r.score ?? '-'}（严重 ${r.critical ?? 0}/警告 ${r.warning ?? 0}）[${statusText(r.status)}]`
    return `### ${r.serverName} [${statusText(r.status)}]\n${r.output || ''}`
  }).join('\n\n')
  navigator.clipboard.writeText(text)
  ElMessage.success(t('sftp.copied'))
}
</script>

<style lang="scss" scoped>
.batch-panel { flex: 1; display: flex; overflow: hidden; min-height: 0; }

// 左侧服务器列表
.bp-servers { width: 240px; flex-shrink: 0; border-right: 1px solid $color-border-light; display: flex; flex-direction: column; min-height: 0; }
.bp-servers-head { display: flex; align-items: center; justify-content: space-between; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light;
  .bp-servers-title { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: $color-text-secondary; }
}
.bp-server-list { flex: 1; overflow-y: auto; padding: $spacing-xs; }
.bp-server-item {
  display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: $border-radius-sm;
  cursor: pointer; transition: background $transition-fast;
  &:hover { background: $color-bg-hover; }
  &.checked { background: $color-bg-active; }
  input { cursor: pointer; accent-color: var(--color-primary, #5b8def); }
}
.bp-conn-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; background: $color-text-muted;
  &.connected { background: $color-success; } &.error { background: $color-danger; } &.connecting { background: $color-warning; }
}
.bp-server-info { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.bp-server-name { font-size: $font-size-sm; color: $color-text-primary; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-server-addr { font-size: 10px; color: $color-text-placeholder; font-family: $font-family-mono; }
.bp-empty { padding: $spacing-md; text-align: center; font-size: $font-size-xs; color: $color-text-placeholder; }

// 右侧
.bp-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; min-height: 0; }
.bp-taskbar { display: flex; align-items: center; gap: $spacing-sm; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; flex-shrink: 0; }
.bp-task-toggle { display: flex; background: $color-bg-input; border-radius: $border-radius-sm; padding: 2px; }
.bp-task-btn {
  padding: 4px 12px; border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: $font-size-xs; color: $color-text-secondary; border-radius: $border-radius-sm - 1px; transition: all $transition-fast;
  &.active { background: $gradient-primary; color: #fff; }
}
.bp-cmd-input { flex: 1; }

.bp-results { flex: 1; overflow-y: auto; padding: $spacing-md; min-height: 0; }

// 巡检对比
.bp-compare { display: flex; flex-direction: column; gap: 6px; }
.bp-compare-row {
  display: flex; align-items: center; gap: 10px; padding: 8px 12px;
  border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border;
  box-shadow: $elevation-1; animation: fade-in-up 0.25s ease;
}
.bp-cmp-name { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bp-cmp-bar { flex: 1; height: 8px; background: $color-border; border-radius: 4px; overflow: hidden; }
.bp-cmp-fill { height: 100%; border-radius: 4px; transition: width 0.6s ease; }
.bp-cmp-score { font-size: $font-size-md; font-weight: 700; font-family: $font-family-mono; width: 32px; text-align: right; }
.bp-cmp-counts { display: flex; gap: 6px; width: 130px; font-size: 10px;
  .crit { color: $color-danger; } .warn { color: $color-warning; }
}
.bp-cmp-status { font-size: $font-size-xs; color: $color-text-secondary;
  &.failed { color: $color-danger; } &.connecting, &.running { color: $color-warning; }
}

// 命令输出
.bp-cmd-results { display: flex; flex-direction: column; gap: $spacing-sm; }
.bp-cmd-card { border-radius: $border-radius-md; background: $glass-bg; border: 1px solid $glass-border; box-shadow: $elevation-1; overflow: hidden; animation: fade-in-up 0.25s ease; }
.bp-cmd-head { display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-bottom: 1px solid $color-border-light; }
.bp-cmd-server { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; flex: 1; }
.bp-cmd-badge { font-size: 9px; font-weight: 600; padding: 1px 6px; border-radius: 3px; text-transform: uppercase;
  &.done { color: $color-success; background: $color-bg-success-hover; }
  &.failed { color: $color-danger; background: $color-bg-danger-hover; }
  &.connecting, &.running { color: $color-warning; background: $color-bg-warning-hover; }
}
.bp-cmd-output { margin: 0; padding: $spacing-sm $spacing-md; font-family: $font-family-mono; font-size: $font-size-xs; line-height: 1.5; color: $color-text-regular; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }

.bp-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
}
</style>
