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
        <div v-if="taskType === 'command'" class="bp-orch-controls">
          <span class="bp-orch-label">{{ t('ops.orchConcurrencyLabel') }}</span>
          <el-input-number v-model="concurrency" size="small" :min="1" :max="Math.max(1, selected.size)" controls-position="right" class="bp-concurrency" />
          <el-checkbox v-model="stopOnChangeFailure">{{ t('ops.orchFailurePolicy') }}</el-checkbox>
        </div>
        <el-button type="primary" size="small" :loading="running" :disabled="running" @click="run">
          {{ running ? t('ops.batchRunning') : t('ops.batchRun') }}
        </el-button>
        <el-button v-if="results.length" size="small" @click="copyAll">
          <el-icon :size="13"><DocumentCopy /></el-icon>{{ t('ops.batchCopyAll') }}
        </el-button>
      </div>
      <div v-if="taskType === 'command'" class="bp-runbooks">
        <span class="bp-runbooks-label">{{ t('ops.runbookTemplates') }}</span>
        <button
          v-for="runbook in batchRunbooks"
          :key="runbook.id"
          class="bp-runbook-chip"
          :title="t(runbook.descriptionKey)"
          @click="applyRunbook(runbook)"
        >
          {{ t(runbook.titleKey) }}
        </button>
      </div>

      <div class="bp-results" v-if="results.length">
        <OrchestrationTaskCard
          v-if="taskType === 'command' && orchestrationStore.currentTask"
          :task="orchestrationStore.currentTask"
          :running="orchestrationStore.isRunning"
          class="bp-orch-card"
        />
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
              <span class="bp-conn-dot" :class="r.status === 'done' ? 'connected' : (r.status === 'failed' || r.status === 'skipped') ? 'error' : 'connecting'"></span>
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
import { computed, ref, reactive } from 'vue'
import { DocumentCopy, Files } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sshExecFull, type SshExecResult } from '@/api/tauri'
import { useSshStore, type SshServer } from '@/stores/ssh'
import { useInspectionStore } from '@/stores/inspection'
import { useOpsAgentStore } from '@/stores/opsAgent'
import { useOrchestrationStore } from '@/stores/orchestration'
import { useLocale } from '@/composables/useLocale'
import {
  createCommandTask,
  runWithConcurrency,
  shouldStopRemaining,
  summarizeOrchestration,
  type OrchestrationTargetInput,
} from '@/utils/ops-orchestration'
import { getBatchRunbooks, type OpsRunbook } from '@/utils/ops-runbooks'
import OrchestrationTaskCard from '@/components/OrchestrationTaskCard.vue'

const sshStore = useSshStore()
const inspection = useInspectionStore()
const opsAgentStore = useOpsAgentStore()
const orchestrationStore = useOrchestrationStore()
const { t } = useLocale()

const selected = reactive(new Set<string>())
const taskType = ref<'inspect' | 'command'>('inspect')
const command = ref('')
const running = ref(false)
const concurrency = ref(2)
const stopOnChangeFailure = ref(true)
const orchestrationSummary = computed(() => orchestrationStore.currentTask ? summarizeOrchestration(orchestrationStore.currentTask) : '')
const batchRunbooks = computed(() => getBatchRunbooks())

interface BatchResult {
  serverId: string; serverName: string
  status: 'connecting' | 'running' | 'done' | 'failed' | 'skipped'
  output?: string; score?: number; critical?: number; warning?: number
}
const results = ref<BatchResult[]>([])

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
  if (s === 'skipped') return t('ops.orchTarget_skipped')
  return t('ops.batchFailed')
}
function scoreColor(s: number): string {
  if (s >= 85) return 'var(--color-success, #4caf7d)'
  if (s >= 60) return 'var(--chart-cpu-warning, #e69138)'
  return 'var(--color-danger, #d45454)'
}

function applyRunbook(runbook: OpsRunbook) {
  if (!runbook.command) return
  taskType.value = 'command'
  command.value = runbook.command
  concurrency.value = Math.max(1, Math.min(runbook.recommendedConcurrency, Math.max(1, selected.size || sshStore.servers.length || 1)))
  stopOnChangeFailure.value = true
  ElMessage.success(t('ops.runbookApplied', { name: t(runbook.titleKey) }))
}

/** 取得可用 sessionId：已连接则复用，否则临时连接。返回 {id, transient} */
async function resolveSession(server: SshServer): Promise<{ id: string; transient: boolean } | null> {
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

function selectedTargets(): OrchestrationTargetInput[] {
  return sshStore.servers
    .filter(server => selected.has(server.id))
    .map(server => ({
      hostId: server.id,
      hostName: server.name,
      hostAddress: `${server.username}@${server.host}:${server.port}`,
      sessionId: sshStore.sessions.find(session => session.serverId === server.id && session.status === 'connected')?.realSessionId,
    }))
}

function formatExecResult(result: SshExecResult): string {
  const parts = [result.stdout.trim(), result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ''].filter(Boolean)
  const body = parts.join('\n') || `[命令执行完毕，退出码 ${result.exit_code ?? 0}，无输出]`
  if (result.timed_out) return `${body}\n[命令超时，已返回部分结果]`
  if (result.exit_code && result.exit_code !== 0) return `${body}\n[退出码 ${result.exit_code}]`
  return body
}

async function authorizeBatchCommand(server: SshServer, commandText: string): Promise<{ allowed: boolean; auditId?: string; reason: string }> {
  const decision = opsAgentStore.decide(commandText, server.id)
  const auditId = opsAgentStore.recordAudit({
    hostId: server.id,
    hostName: server.name,
    command: commandText,
    decision,
    approved: decision.action === 'allow' ? true : null,
    status: decision.action === 'deny' ? 'denied' : 'pending',
  })

  if (decision.action === 'allow') return { allowed: true, auditId, reason: '' }
  if (decision.action === 'deny') return { allowed: false, auditId, reason: decision.reason }

  try {
    await ElMessageBox.confirm(
      `${decision.action === 'double_confirm' ? '⚠️ ' : ''}${t('ai.riskChange')}：${decision.reason}\n\n${server.name} (${server.username}@${server.host})\n\n\`${commandText}\`\n\n${t('common.confirm')}？`,
      decision.action === 'double_confirm' ? t('ai.confirmHighRisk') : t('ai.confirmChange'),
      {
        type: 'warning',
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
      }
    )
    if (decision.action === 'double_confirm') {
      await ElMessageBox.confirm(
        `${t('ai.riskHigh')}：${decision.reason}\n\n${server.name} (${server.username}@${server.host})\n\n\`${commandText}\`\n\n${t('ai.confirmHighRiskAgain')}？`,
        t('ai.confirmHighRiskAgain'),
        {
          type: 'error',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
        }
      )
    }
    opsAgentStore.setAuditApproval(auditId, true)
    return { allowed: true, auditId, reason: '' }
  } catch {
    opsAgentStore.setAuditApproval(auditId, false)
    return { allowed: false, auditId, reason: t('ai.commandBlocked') }
  }
}

async function run() {
  if (selected.size === 0) { ElMessage.warning(t('ops.batchSelectFirst')); return }
  if (taskType.value === 'command') {
    if (!command.value.trim()) return
  }

  running.value = true
  const targets = sshStore.servers.filter(s => selected.has(s.id))
  results.value = targets.map(s => ({ serverId: s.id, serverName: s.name, status: 'connecting' as const }))
  if (taskType.value === 'command') {
    const task = createCommandTask({
      mode: 'batch',
      title: command.value.trim(),
      command: command.value.trim(),
      targets: selectedTargets(),
      concurrency: concurrency.value,
    })
    orchestrationStore.setTask(task)
    orchestrationStore.setTaskStatus('running')
  } else {
    orchestrationStore.clearTask()
  }

  let stopRemaining = false
  await runWithConcurrency(targets, taskType.value === 'command' ? Math.min(concurrency.value, Math.max(1, targets.length)) : targets.length, async (server, idx) => {
    const slot = results.value[idx]
    const task = orchestrationStore.currentTask
    const step = task?.steps[0]
    if (stopRemaining) {
      slot.status = 'skipped'
      slot.output = t('ops.orchTarget_skipped')
      orchestrationStore.setTargetStatus(server.id, 'skipped', slot.output)
      return
    }

    orchestrationStore.setTargetStatus(server.id, 'connecting')
    const sess = await resolveSession(server)
    if (!sess) {
      slot.status = 'failed'
      slot.output = 'Connection failed'
      orchestrationStore.setTargetStatus(server.id, 'failed', slot.output)
      return
    }
    slot.status = 'running'
    orchestrationStore.setTargetStatus(server.id, 'running')
    try {
      if (taskType.value === 'inspect') {
        const rep = await inspection.runInspection(sess.id, server.name, server.id)
        slot.score = rep.healthScore
        slot.critical = rep.findings.filter(f => f.severity === 'critical').length
        slot.warning = rep.findings.filter(f => f.severity === 'warning').length
        slot.status = 'done'
      } else {
        if (step) orchestrationStore.setStepStatus(step.id, 'waiting_approval')
        const authorization = await authorizeBatchCommand(server, command.value.trim())
        if (!authorization.allowed) {
          slot.status = 'skipped'
          slot.output = authorization.reason
          if (step) orchestrationStore.setStepStatus(step.id, 'skipped')
          orchestrationStore.setTargetStatus(server.id, 'skipped', authorization.reason)
          return
        }

        if (step) {
          step.auditId = authorization.auditId
          orchestrationStore.setStepStatus(step.id, 'running')
        }
        const execResult = await sshExecFull(sess.id, command.value.trim())
        slot.output = formatExecResult(execResult)
        if (authorization.auditId) opsAgentStore.completeAudit(authorization.auditId, slot.output)
        const failed = execResult.timed_out || (execResult.exit_code !== null && execResult.exit_code !== 0)
        slot.status = failed ? 'failed' : 'done'
        orchestrationStore.appendTargetSummary(server.id, slot.output)
        orchestrationStore.setTargetStatus(server.id, failed ? 'failed' : 'completed', failed ? slot.output : '')
        if (step) {
          orchestrationStore.appendStepOutput(step.id, `${server.name}: ${slot.output}`)
          orchestrationStore.setStepStatus(step.id, failed ? 'failed' : 'completed')
          if (failed && stopOnChangeFailure.value && task && shouldStopRemaining(task, { ...step, status: 'failed' })) {
            stopRemaining = true
            orchestrationStore.setTaskStatus('stopped')
          }
        }
      }
    } catch (e: any) {
      slot.status = 'failed'; slot.output = e?.message || String(e)
      orchestrationStore.setTargetStatus(server.id, 'failed', slot.output)
      if (step) {
        orchestrationStore.appendStepOutput(step.id, `${server.name}: ${slot.output}`)
        orchestrationStore.setStepStatus(step.id, 'failed')
        if (stopOnChangeFailure.value && task && shouldStopRemaining(task, { ...step, status: 'failed' })) {
          stopRemaining = true
          orchestrationStore.setTaskStatus('stopped')
        }
      }
    } finally {
      if (sess.transient) { try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(sess.id) } catch {} }
    }
  })

  if (taskType.value === 'command' && orchestrationStore.currentTask?.status !== 'stopped') {
    const failed = results.value.some(result => result.status === 'failed')
    orchestrationStore.setTaskStatus(failed ? 'failed' : 'completed')
    const step = orchestrationStore.currentTask.steps[0]
    if (step && step.status !== 'skipped') orchestrationStore.setStepStatus(step.id, failed ? 'failed' : 'completed')
  }

  running.value = false
}

function copyAll() {
  const body = results.value.map(r => {
    if (taskType.value === 'inspect') return `${r.serverName}: 健康分 ${r.score ?? '-'}（严重 ${r.critical ?? 0}/警告 ${r.warning ?? 0}）[${statusText(r.status)}]`
    return `### ${r.serverName} [${statusText(r.status)}]\n${r.output || ''}`
  }).join('\n\n')
  const text = orchestrationSummary.value ? `${orchestrationSummary.value}\n\n${body}` : body
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
.bp-taskbar { display: flex; align-items: center; gap: $spacing-sm; padding: $spacing-sm $spacing-md; border-bottom: 1px solid $color-border-light; flex-shrink: 0; flex-wrap: wrap; }
.bp-task-toggle { display: flex; background: $color-bg-input; border-radius: $border-radius-sm; padding: 2px; }
.bp-task-btn {
  padding: 4px 12px; border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: $font-size-xs; color: $color-text-secondary; border-radius: $border-radius-sm - 1px; transition: all $transition-fast;
  &.active { background: $gradient-primary; color: #fff; }
}
.bp-cmd-input { flex: 1; }
.bp-orch-controls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; font-size: $font-size-xs; color: $color-text-secondary; }
.bp-orch-label { white-space: nowrap; }
.bp-concurrency { width: 94px; }
.bp-runbooks { display: flex; align-items: center; gap: 6px; padding: 6px $spacing-md; border-bottom: 1px solid $color-border-light; flex-wrap: wrap; flex-shrink: 0; }
.bp-runbooks-label { font-size: 10px; color: $color-text-placeholder; text-transform: uppercase; letter-spacing: 0.4px; }
.bp-runbook-chip {
  border: 1px solid $color-border-light; background: $color-bg-input; color: $color-text-secondary;
  border-radius: 999px; padding: 3px 9px; font-size: $font-size-xs; cursor: pointer; transition: all $transition-fast;
  &:hover { color: $color-primary; border-color: $color-primary; background: $color-bg-hover; }
}

.bp-results { flex: 1; overflow-y: auto; padding: $spacing-md; min-height: 0; }
.bp-orch-card { margin-bottom: $spacing-md; }

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
  &.skipped { color: $color-text-secondary; background: $color-bg-hover; }
  &.connecting, &.running { color: $color-warning; background: $color-bg-warning-hover; }
}
.bp-cmd-output { margin: 0; padding: $spacing-sm $spacing-md; font-family: $font-family-mono; font-size: $font-size-xs; line-height: 1.5; color: $color-text-regular; white-space: pre-wrap; word-break: break-all; max-height: 300px; overflow-y: auto; }

.bp-placeholder { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; color: $color-text-secondary;
  .el-icon { color: $color-text-muted; opacity: 0.4; } p { margin: 0; font-size: $font-size-sm; }
}
</style>
