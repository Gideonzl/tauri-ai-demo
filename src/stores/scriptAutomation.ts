import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { sshExecFull } from '@/api/tauri'
import { useSshStore } from '@/stores/ssh'
import { resolveSession, releaseSession } from '@/utils/ops-connect'
import { classifyCommand } from '@/utils/ops-permission'
import { isValidCron, nextCronTime } from '@/utils/script-cron'

export type ScriptRunStatus = 'running' | 'success' | 'failed' | 'skipped'

export interface ManagedScript {
  id: string
  name: string
  description: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
}

export interface ScriptSchedule {
  id: string
  scriptId: string
  targetIds: string[]
  cron: string
  enabled: boolean
  nextRunAt: number | null
  lastRunAt?: number
  lastStatus?: Exclude<ScriptRunStatus, 'running'>
  consecutiveFailures?: number
  retryAt?: number | null
  retryAttempt?: number
  isRunning?: boolean
  lastError?: string
}

export interface ScriptRunLog {
  id: string
  scriptId: string
  scriptName: string
  serverId: string
  serverName: string
  scheduleId?: string
  status: ScriptRunStatus
  output: string
  startedAt: number
  finishedAt?: number
}
export interface ScriptVersion { id: string; scriptId: string; name: string; description: string; content: string; tags: string[]; createdAt: number }
export interface ScriptExecutionSummary { attempted: boolean; total: number; success: number; failed: number; skipped: number }

const SCRIPTS_KEY = 'script-automation-scripts'
const SCHEDULES_KEY = 'script-automation-schedules'
const LOGS_KEY = 'script-automation-logs'
const VERSIONS_KEY = 'script-automation-versions'
const MAX_LOGS = 200
const MAX_VERSIONS_PER_SCRIPT = 30
const SCHEDULE_RETRY_DELAY = 60_000
const MAX_SCHEDULE_RETRIES = 1
let schedulerTimer: ReturnType<typeof window.setInterval> | null = null

function createId(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }

function readStored<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback }
}

function defaultScripts(): ManagedScript[] {
  const now = Date.now()
  return [{
    id: 'script-health-snapshot',
    name: '服务器健康快照',
    description: '采集主机名、负载、内存与磁盘空间，适合作为安全的定时健康检查。',
    content: 'hostname && uptime && echo "--- memory ---" && free -h && echo "--- disk ---" && df -h',
    tags: ['巡检', '只读'],
    createdAt: now,
    updatedAt: now,
  }]
}

function formatResult(result: Awaited<ReturnType<typeof sshExecFull>>): string {
  const body = [result.stdout.trim(), result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ''].filter(Boolean).join('\n')
    || '[命令执行完毕，无输出]'
  if (result.timed_out) return `${body}\n[命令超时，已返回部分结果]`
  if (result.exit_code && result.exit_code !== 0) return `${body}\n[退出码 ${result.exit_code}]`
  return body
}

export const useScriptAutomationStore = defineStore('scriptAutomation', () => {
  const scripts = ref<ManagedScript[]>(readStored(SCRIPTS_KEY, defaultScripts()))
  const schedules = ref<ScriptSchedule[]>(readStored(SCHEDULES_KEY, []))
  const runLogs = ref<ScriptRunLog[]>(readStored(LOGS_KEY, []))
  const versions = ref<ScriptVersion[]>(readStored(VERSIONS_KEY, []))
  const runningScriptIds = ref<string[]>([])
  const initialized = ref(false)

  const runningCount = computed(() => runningScriptIds.value.length)
  const recentLogs = computed(() => [...runLogs.value].sort((left, right) => right.startedAt - left.startedAt))

  function saveScripts() { try { localStorage.setItem(SCRIPTS_KEY, JSON.stringify(scripts.value)) } catch {} }
  function saveSchedules() { try { localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules.value)) } catch {} }
  function saveLogs() { try { localStorage.setItem(LOGS_KEY, JSON.stringify(runLogs.value.slice(0, MAX_LOGS))) } catch {} }
  function saveVersions() { try { localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions.value)) } catch {} }
  function versionsFor(scriptId: string) { return versions.value.filter(item => item.scriptId === scriptId).sort((a, b) => b.createdAt - a.createdAt) }

  function upsertScript(input: Omit<ManagedScript, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): ManagedScript {
    const now = Date.now()
    const clean = {
      name: input.name.trim() || '未命名脚本',
      description: input.description.trim(),
      content: input.content.trim(),
      tags: input.tags.map(tag => tag.trim()).filter(Boolean).slice(0, 8),
    }
    const existing = input.id ? scripts.value.find(script => script.id === input.id) : undefined
    if (existing) {
      if (existing.content !== clean.content || existing.name !== clean.name || existing.description !== clean.description || existing.tags.join('|') !== clean.tags.join('|')) {
        const previous = versions.value.filter(item => item.scriptId === existing.id)
        const otherScripts = versions.value.filter(item => item.scriptId !== existing.id)
        versions.value = [{ id: createId('script-version'), scriptId: existing.id, name: existing.name, description: existing.description, content: existing.content, tags: [...existing.tags], createdAt: now }, ...previous].slice(0, MAX_VERSIONS_PER_SCRIPT).concat(otherScripts)
        saveVersions()
      }
      Object.assign(existing, clean, { updatedAt: now })
      saveScripts()
      return existing
    }
    const script: ManagedScript = { id: createId('script'), ...clean, createdAt: now, updatedAt: now }
    scripts.value.unshift(script)
    saveScripts()
    return script
  }

  function removeScript(scriptId: string) {
    scripts.value = scripts.value.filter(script => script.id !== scriptId)
    schedules.value = schedules.value.filter(schedule => schedule.scriptId !== scriptId)
    versions.value = versions.value.filter(version => version.scriptId !== scriptId)
    saveScripts(); saveSchedules(); saveVersions()
  }

  function restoreVersion(versionId: string): ManagedScript | undefined {
    const version = versions.value.find(item => item.id === versionId)
    if (!version) return undefined
    return upsertScript({ id: version.scriptId, name: version.name, description: version.description, content: version.content, tags: version.tags })
  }

  function saveSchedule(input: Omit<ScriptSchedule, 'id' | 'nextRunAt' | 'lastRunAt'> & { id?: string }): ScriptSchedule {
    if (!isValidCron(input.cron)) throw new Error('Invalid Cron expression')
    const normalized = { scriptId: input.scriptId, targetIds: [...new Set(input.targetIds)], cron: input.cron.trim(), enabled: input.enabled }
    const existing = input.id ? schedules.value.find(schedule => schedule.id === input.id) : undefined
    const nextRunAt = normalized.enabled ? nextCronTime(normalized.cron) : null
    if (normalized.enabled && !nextRunAt) throw new Error('Cron expression has no future execution time')
    if (existing) {
      Object.assign(existing, normalized, { nextRunAt, retryAt: null, retryAttempt: 0, isRunning: false })
      saveSchedules()
      return existing
    }
    const schedule: ScriptSchedule = { id: createId('schedule'), ...normalized, nextRunAt, retryAt: null, retryAttempt: 0, isRunning: false }
    schedules.value.unshift(schedule)
    saveSchedules()
    return schedule
  }

  function removeSchedule(scheduleId: string) { schedules.value = schedules.value.filter(schedule => schedule.id !== scheduleId); saveSchedules() }
  function setScheduleEnabled(scheduleId: string, enabled: boolean) {
    const schedule = schedules.value.find(item => item.id === scheduleId)
    if (!schedule) return
    schedule.enabled = enabled
    schedule.nextRunAt = enabled ? nextCronTime(schedule.cron) : null
    schedule.retryAt = null
    schedule.retryAttempt = 0
    schedule.isRunning = false
    saveSchedules()
  }

  function appendLog(log: ScriptRunLog) { runLogs.value.unshift(log); runLogs.value = runLogs.value.slice(0, MAX_LOGS); saveLogs() }

  async function executeScript(scriptId: string, targetIds: string[], scheduleId?: string): Promise<ScriptExecutionSummary> {
    const script = scripts.value.find(item => item.id === scriptId)
    if (!script) throw new Error('Script not found')
    if (!script.content.trim()) throw new Error('Script is empty')
    if (classifyCommand(script.content).risk !== 'read_only') throw new Error('Only read-only scripts can run in Script Management')
    if (runningScriptIds.value.includes(scriptId)) return { attempted: false, total: targetIds.length, success: 0, failed: 0, skipped: 0 }

    const sshStore = useSshStore()
    if (!sshStore.servers.length) sshStore.init()
    const summary: ScriptExecutionSummary = { attempted: true, total: targetIds.length, success: 0, failed: 0, skipped: 0 }
    runningScriptIds.value.push(scriptId)
    try {
      for (const targetId of targetIds) {
        const server = sshStore.servers.find(item => item.id === targetId)
        const startedAt = Date.now()
        const log: ScriptRunLog = {
          id: createId('script-run'), scriptId, scriptName: script.name, serverId: targetId,
          serverName: server?.name || targetId, scheduleId, status: 'running', output: '', startedAt,
        }
        appendLog(log)
        if (!server) {
          log.status = 'skipped'; log.output = '目标服务器已不存在'; log.finishedAt = Date.now(); summary.skipped += 1; saveLogs(); continue
        }
        const session = await resolveSession(server)
        if (!session) {
          log.status = 'failed'; log.output = '无法建立 SSH 连接'; log.finishedAt = Date.now(); summary.failed += 1; saveLogs(); continue
        }
        try {
          const result = await sshExecFull(session.id, script.content)
          log.output = formatResult(result)
          log.status = result.timed_out || (result.exit_code !== null && result.exit_code !== 0) ? 'failed' : 'success'
        } catch (error) {
          log.status = 'failed'; log.output = error instanceof Error ? error.message : String(error)
        } finally {
          log.finishedAt = Date.now()
          await releaseSession(session)
          if (log.status === 'success') summary.success += 1
          else if (log.status === 'failed') summary.failed += 1
          else summary.skipped += 1
          saveLogs()
        }
      }
    } finally {
      runningScriptIds.value = runningScriptIds.value.filter(id => id !== scriptId)
    }
    return summary
  }

  function summaryStatus(summary: ScriptExecutionSummary): Exclude<ScriptRunStatus, 'running'> {
    if (summary.failed) return 'failed'
    if (summary.success) return 'success'
    return 'skipped'
  }

  function completeScheduledExecution(schedule: ScriptSchedule, summary: ScriptExecutionSummary, isRetry: boolean) {
    schedule.isRunning = false
    if (!summary.attempted) { saveSchedules(); return }
    schedule.lastStatus = summaryStatus(summary)
    if (schedule.lastStatus === 'failed') {
      schedule.consecutiveFailures = (schedule.consecutiveFailures || 0) + 1
      schedule.lastError = `有 ${summary.failed} 个目标执行失败`
      const canRetry = !isRetry && (schedule.retryAttempt || 0) < MAX_SCHEDULE_RETRIES
      schedule.retryAt = canRetry ? Date.now() + SCHEDULE_RETRY_DELAY : null
      schedule.retryAttempt = canRetry ? (schedule.retryAttempt || 0) + 1 : 0
    } else {
      schedule.consecutiveFailures = 0
      schedule.lastError = undefined
      schedule.retryAt = null
      schedule.retryAttempt = 0
    }
    saveSchedules()
  }

  async function runScheduleNow(scheduleId: string): Promise<ScriptExecutionSummary | undefined> {
    const schedule = schedules.value.find(item => item.id === scheduleId)
    if (!schedule || schedule.isRunning) return undefined
    schedule.isRunning = true
    schedule.lastRunAt = Date.now()
    saveSchedules()
    try {
      const summary = await executeScript(schedule.scriptId, schedule.targetIds, schedule.id)
      completeScheduledExecution(schedule, summary, true)
      return summary
    } catch (error) {
      completeScheduledExecution(schedule, { attempted: true, total: schedule.targetIds.length, success: 0, failed: schedule.targetIds.length || 1, skipped: 0 }, true)
      throw error
    }
  }

  async function runDueSchedules() {
    const now = Date.now()
    for (const schedule of schedules.value) {
      if (!schedule.enabled || schedule.isRunning) continue
      const cronDue = Boolean(schedule.nextRunAt && schedule.nextRunAt <= now)
      const retryDue = Boolean(schedule.retryAt && schedule.retryAt <= now)
      if (!cronDue && !retryDue) continue
      const script = scripts.value.find(item => item.id === schedule.scriptId)
      const isRetry = retryDue && !cronDue
      if (cronDue) {
        schedule.lastRunAt = now
        schedule.nextRunAt = nextCronTime(schedule.cron, now)
        schedule.retryAt = null
        schedule.retryAttempt = 0
      }
      if (isRetry) schedule.lastRunAt = now
      if (!script || classifyCommand(script.content).risk !== 'read_only') {
        schedule.enabled = false
        schedule.nextRunAt = null
        schedule.lastStatus = 'skipped'
        schedule.consecutiveFailures = 0
        schedule.retryAt = null
        schedule.retryAttempt = 0
        schedule.lastError = undefined
        appendLog({
          id: createId('script-run'), scriptId: schedule.scriptId, scriptName: script?.name || '已删除脚本',
          serverId: schedule.targetIds[0] || '', serverName: '计划任务', scheduleId: schedule.id,
          status: 'skipped', output: '脚本不再是只读脚本，计划任务已自动停用。', startedAt: now, finishedAt: now,
        })
        saveSchedules()
        continue
      }
      schedule.isRunning = true
      saveSchedules()
      void executeScript(schedule.scriptId, schedule.targetIds, schedule.id)
        .then(summary => completeScheduledExecution(schedule, summary, isRetry))
        .catch(() => completeScheduledExecution(schedule, { attempted: true, total: schedule.targetIds.length, success: 0, failed: schedule.targetIds.length || 1, skipped: 0 }, isRetry))
    }
  }

  function init() {
    if (initialized.value) return
    initialized.value = true
    const staleRunning = schedules.value.some(schedule => schedule.isRunning)
    if (staleRunning) {
      schedules.value.forEach(schedule => { schedule.isRunning = false })
      saveSchedules()
    }
    void runDueSchedules()
    schedulerTimer = window.setInterval(() => { void runDueSchedules() }, 15000)
  }

  function stopScheduler() { if (schedulerTimer) window.clearInterval(schedulerTimer); schedulerTimer = null; initialized.value = false }

  return {
    scripts, schedules, runLogs: recentLogs, versions, versionsFor, runningScriptIds, runningCount,
    upsertScript, removeScript, restoreVersion, saveSchedule, removeSchedule, setScheduleEnabled, runScheduleNow,
    executeScript, init, stopScheduler,
  }
})
