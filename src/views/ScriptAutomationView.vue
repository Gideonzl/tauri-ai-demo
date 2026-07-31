<template>
  <div ref="scriptPageRef" class="script-page">
    <aside class="script-library" :style="{ '--script-library-width': `${libraryWidth}px` }">
      <div class="script-library-head">
        <div>
          <span class="script-eyebrow">AUTOMATION STUDIO</span>
          <h2>{{ t('scripts.title') }}</h2>
        </div>
        <div class="script-library-actions">
          <el-tooltip :content="t('scripts.importLibrary')" placement="bottom">
            <el-button class="script-library-icon-button" size="small" circle :aria-label="t('scripts.importLibrary')" @click="triggerImport"><el-icon :size="13"><Upload /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip :content="t('scripts.exportLibrary')" placement="bottom">
            <el-button class="script-library-icon-button" size="small" circle :aria-label="t('scripts.exportLibrary')" @click="exportLibrary"><el-icon :size="13"><Download /></el-icon></el-button>
          </el-tooltip>
          <el-button class="script-library-new-button" type="primary" size="small" @click="newScript"><el-icon :size="13"><Plus /></el-icon><span>{{ t('scripts.newScript') }}</span></el-button>
        </div>
      </div>
      <div class="script-library-meta">
        <span>{{ t('scripts.scriptCount', { n: scriptStore.scripts.length }) }}</span>
        <span><i></i>{{ t('scripts.runningCount', { n: scriptStore.runningCount }) }}</span>
      </div>
      <div class="script-list">
        <button
          v-for="script in scriptStore.scripts"
          :key="script.id"
          type="button"
          class="script-list-item"
          :class="{ active: activeScriptId === script.id }"
          @click="selectScript(script.id)"
        >
          <span class="script-file-icon"><el-icon :size="16"><Document /></el-icon></span>
          <span class="script-list-copy"><b>{{ script.name }}</b><small>{{ script.description || t('scripts.noDescription') }}</small></span>
          <span class="script-risk-dot" :class="scriptRisk(script.content)"></span>
        </button>
        <OpsEmptyState v-if="!scriptStore.scripts.length" :icon="Document" :title="t('scripts.emptyScripts')" />
      </div>
    </aside>
    <input ref="scriptImportInput" class="script-import-input" type="file" accept="application/json,.json" @change="importLibrary" />

    <div
      class="script-library-resize"
      role="separator"
      aria-orientation="vertical"
      :aria-label="t('scripts.resizeLibrary')"
      @pointerdown="onLibraryResizeStart"
      @dblclick="resetLibraryWidth"
    ><span></span></div>

    <main class="script-workspace">
      <header class="script-page-head ops-toolbar">
        <div class="script-tabs" role="tablist">
          <button type="button" :class="{ active: activeTab === 'editor' }" @click="activeTab = 'editor'">{{ t('scripts.tabScripts') }}</button>
          <button type="button" :class="{ active: activeTab === 'schedules' }" @click="activeTab = 'schedules'">{{ t('scripts.tabSchedules') }}<i v-if="scriptStore.schedules.length">{{ scriptStore.schedules.length }}</i></button>
          <button type="button" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">{{ t('scripts.tabHistory') }}<i v-if="scriptStore.runLogs.length">{{ scriptStore.runLogs.length }}</i></button>
        </div>
        <div class="script-head-status"><span></span>{{ t('scripts.schedulerOnline') }}</div>
      </header>

      <section v-if="activeTab === 'editor'" class="script-editor-view">
        <div class="script-editor-main">
          <div class="script-form-head">
            <div class="script-form-fields">
              <el-input v-model="draft.name" class="script-name-input" :placeholder="t('scripts.namePlaceholder')" />
              <el-input v-model="draft.description" class="script-description-input" :placeholder="t('scripts.descriptionPlaceholder')" />
            </div>
            <div class="script-form-actions">
              <el-button class="script-focus-button" type="primary" size="small" @click="openFocusEditor"><el-icon :size="14"><FullScreen /></el-icon>{{ t('scripts.focusEdit') }}</el-button>
              <el-button size="small" :disabled="!draft.id" @click="versionHistoryOpen = true"><el-icon :size="13"><Clock /></el-icon>{{ t('scripts.versionHistory') }}</el-button>
              <el-button size="small" :disabled="!draft.id" @click="duplicateScript"><el-icon :size="13"><CopyDocument /></el-icon>{{ t('scripts.duplicateScript') }}</el-button>
              <el-button size="small" @click="askAi('draft')"><el-icon :size="13"><MagicStick /></el-icon>{{ t('scripts.aiDraft') }}</el-button>
              <el-button size="small" @click="askAi('review')"><el-icon :size="13"><ChatDotRound /></el-icon>{{ t('scripts.aiReview') }}</el-button>
              <el-button type="primary" size="small" @click="saveScript">{{ t('common.save') }}</el-button>
              <el-button size="small" text class="script-delete-button" :disabled="!draft.id" @click="deleteScript"><el-icon :size="13"><Delete /></el-icon>{{ t('common.delete') }}</el-button>
            </div>
          </div>

          <div class="script-target-select-row">
            <div><span>{{ t('scripts.executionTargets') }}</span><small>{{ t('scripts.selectedServers', { n: selectedTargets.size }) }}</small></div>
            <el-select v-model="selectedTargetIds" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="2" :placeholder="t('scripts.selectExecutionTargets')" :no-data-text="t('workspace.noHosts')">
              <el-option v-for="server in sshStore.servers" :key="server.id" :value="server.id" :label="`${server.name} · ${server.username}@${server.host}`">
                <span class="script-target-option"><i :class="serverStatus(server.id)"></i><b>{{ server.name }}</b><small>{{ server.username }}@{{ server.host }}</small></span>
              </el-option>
            </el-select>
          </div>

          <div class="script-editor-label"><span>{{ t('scripts.scriptContent') }}</span><span class="script-language">SHELL</span></div>
          <textarea v-model="draft.content" class="script-editor" spellcheck="false" :placeholder="t('scripts.contentPlaceholder')"></textarea>
          <div class="script-form-foot">
            <el-input v-model="draft.tags" size="small" :placeholder="t('scripts.tagsPlaceholder')" class="script-tags-input" />
            <span class="script-updated">{{ draft.id ? t('scripts.localSaved') : t('scripts.newUnsaved') }}</span>
          </div>
          <div class="script-execution-footer">
            <div class="script-risk-card" :class="currentRisk">
            <div><el-icon :size="15"><Lock /></el-icon><b>{{ t(`ai.risk_${currentRisk}`) }}</b></div>
            <p>{{ currentRisk === 'read_only' ? t('scripts.readonlyHint') : t('scripts.changeHint') }}</p>
            </div>
            <div class="script-execution-actions"><p class="script-scheduler-note">{{ t('scripts.schedulerHint') }}</p><el-button class="script-run-btn" type="primary" :loading="scriptStore.runningScriptIds.includes(draft.id || '')" :disabled="!canRun" @click="runNow"><el-icon :size="14"><VideoPlay /></el-icon>{{ t('scripts.runNow') }}</el-button></div>
          </div>
        </div>
      </section>

      <section v-else-if="activeTab === 'schedules'" class="script-schedules-view">
        <div class="schedule-create-card">
          <div class="schedule-card-head"><div><span class="script-eyebrow">CRON</span><h3>{{ t('scripts.newSchedule') }}</h3></div><span class="schedule-enabled">{{ t('scripts.allScriptsEnabled') }}</span></div>
          <div class="schedule-form-grid">
            <label><span>{{ t('scripts.scheduleScript') }}</span><el-select v-model="scheduleDraft.scriptId" size="small"><el-option v-for="script in scriptStore.scripts" :key="script.id" :label="script.name" :value="script.id" /></el-select></label>
            <label><span>{{ t('scripts.cronExpression') }}</span><el-input v-model="scheduleDraft.cron" size="small" placeholder="*/30 * * * *" /></label>
          </div>
          <div class="schedule-preview" :class="{ invalid: !cronIsValid }">
            <span>{{ t('scripts.schedulePreview') }}</span>
            <div v-if="cronPreviewTimes.length">
              <i v-for="time in cronPreviewTimes" :key="time">{{ formatDate(time) }}</i>
            </div>
            <small v-else>{{ t('scripts.schedulePreviewInvalid') }}</small>
          </div>
          <div class="schedule-target-picker"><span>{{ t('scripts.executionTargets') }}</span><div><button v-for="server in sshStore.servers" :key="server.id" type="button" :class="{ active: scheduleTargets.has(server.id) }" @click="toggleScheduleTarget(server.id)">{{ server.name }}</button></div></div>
          <div class="schedule-card-foot"><span>{{ t('scripts.cronHint') }}</span><el-button type="primary" size="small" @click="createSchedule">{{ t('scripts.createSchedule') }}</el-button></div>
        </div>

        <div class="schedule-list">
          <div v-for="schedule in scriptStore.schedules" :key="schedule.id" class="schedule-item" :class="{ disabled: !schedule.enabled, failed: schedule.lastStatus === 'failed', running: schedule.isRunning }">
            <div class="schedule-icon"><el-icon :size="17"><Timer /></el-icon></div>
            <div class="schedule-copy"><b>{{ scriptName(schedule.scriptId) }}</b><span><code>{{ schedule.cron }}</code> · {{ t('scripts.targetsCount', { n: schedule.targetIds.length }) }}</span><small>{{ schedule.nextRunAt ? t('scripts.nextRun', { time: formatDate(schedule.nextRunAt) }) : t('scripts.disabled') }}</small><small v-if="schedule.isRunning" class="schedule-state running">{{ t('scripts.scheduleRunning') }}</small><small v-else-if="schedule.retryAt" class="schedule-state retry">{{ t('scripts.scheduleRetryPending', { time: formatDate(schedule.retryAt), n: schedule.retryAttempt || 1 }) }}</small><small v-else-if="schedule.lastStatus" class="schedule-state" :class="schedule.lastStatus">{{ t('scripts.lastRunStatus', { status: statusLabel(schedule.lastStatus) }) }}</small><small v-if="schedule.consecutiveFailures" class="schedule-failure-alert">{{ t('scripts.consecutiveFailures', { n: schedule.consecutiveFailures }) }} · {{ schedule.lastError }}</small></div>
            <el-switch :model-value="schedule.enabled" size="small" @change="(value: boolean) => scriptStore.setScheduleEnabled(schedule.id, value)" />
            <el-button size="small" text :disabled="schedule.isRunning" @click="openScheduleEditor(schedule.id)"><el-icon :size="13"><EditPen /></el-icon></el-button>
            <el-button size="small" text :disabled="!schedule.enabled || schedule.isRunning" @click="runScheduleNow(schedule.id)"><el-icon :size="13"><VideoPlay /></el-icon></el-button>
            <el-button size="small" text class="schedule-delete" @click="removeSchedule(schedule.id)"><el-icon :size="13"><Delete /></el-icon></el-button>
          </div>
          <OpsEmptyState v-if="!scriptStore.schedules.length" :icon="Timer" :title="t('scripts.emptySchedules')" :description="t('scripts.schedulerHint')" />
        </div>
      </section>

      <section v-else class="script-history-view">
        <div class="history-summary"><div><span>{{ t('scripts.historyTitle') }}</span><small>{{ t('scripts.historyHint') }}</small></div><div class="history-actions"><el-select v-model="historyStatusFilter" size="small" :aria-label="t('scripts.filterStatus')"><el-option :label="t('scripts.filterAll')" value="all" /><el-option :label="t('scripts.status_success')" value="success" /><el-option :label="t('scripts.status_failed')" value="failed" /><el-option :label="t('scripts.status_skipped')" value="skipped" /></el-select><el-input v-model="historyQuery" size="small" clearable :placeholder="t('scripts.historySearchPlaceholder')" /><el-button size="small" @click="exportHistory"><el-icon :size="13"><Download /></el-icon>{{ t('scripts.exportHistory') }}</el-button><el-button size="small" text class="history-clear" :disabled="!filteredLogs.length" @click="clearHistory"><el-icon :size="13"><Delete /></el-icon>{{ t('scripts.clearHistory') }}</el-button></div></div>
        <div class="script-log-list">
          <article v-for="log in filteredLogs" :key="log.id" class="script-log" :class="log.status">
            <div class="script-log-head">
              <span class="script-log-status"></span><b>{{ log.scriptName }}</b><span class="script-log-server">{{ log.serverName }}</span><span class="script-log-badge">{{ statusLabel(log.status) }}</span><span class="script-log-time">{{ formatDate(log.startedAt) }}</span>
              <button type="button" @click="toggleLog(log.id)"><el-icon :size="13"><ArrowUp v-if="expandedLogs.has(log.id)" /><ArrowDown v-else /></el-icon></button>
            </div>
            <pre v-if="expandedLogs.has(log.id)">{{ log.output || t('scripts.noOutput') }}</pre>
            <p v-else>{{ outputPreview(log.output) }}</p>
          </article>
          <OpsEmptyState v-if="!filteredLogs.length" :icon="Document" :title="historyQuery || historyStatusFilter !== 'all' ? t('scripts.emptyFilteredHistory') : t('scripts.emptyHistory')" />
        </div>
      </section>
    </main>

    <el-dialog v-model="focusEditorOpen" class="script-focus-dialog" :title="t('scripts.focusEditTitle')" width="min(980px, calc(100vw - 48px))" :close-on-click-modal="false">
      <p class="focus-editor-hint">{{ t('scripts.focusEditHint') }}</p>
      <div class="focus-editor-fields">
        <el-input v-model="draft.name" :placeholder="t('scripts.namePlaceholder')" />
        <el-input v-model="draft.description" :placeholder="t('scripts.descriptionPlaceholder')" />
      </div>
      <div class="focus-editor-label"><span>{{ t('scripts.scriptContent') }}</span><span>SHELL</span></div>
      <textarea ref="focusEditorRef" v-model="draft.content" class="focus-script-editor" spellcheck="false" :placeholder="t('scripts.contentPlaceholder')"></textarea>
      <template #footer>
        <el-button @click="focusEditorOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveAndCloseFocusEditor">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="aiDiffOpen" class="script-ai-diff-dialog" :title="t('scripts.aiDiffTitle')" width="min(1080px, calc(100vw - 48px))" :close-on-click-modal="false">
      <p class="ai-diff-hint">{{ t('scripts.aiDiffHint') }}</p>
      <div v-if="aiSuggestion" class="ai-diff-grid">
        <section><span>{{ t('scripts.currentScript') }}</span><pre>{{ aiSuggestion.originalContent || t('scripts.noScriptContent') }}</pre></section>
        <section><span>{{ t('scripts.aiSuggestedScript') }}</span><pre>{{ aiSuggestion.suggestedContent }}</pre></section>
      </div>
      <div v-if="aiSuggestion?.mode === 'review'" class="ai-review-summary" :class="aiSuggestion.risk">
        <b>{{ t(`ai.risk_${aiSuggestion.risk}`) }}</b><span>{{ aiSuggestion.reviewSummary || t('scripts.aiReviewEmpty') }}</span>
      </div>
      <template #footer>
        <el-button @click="aiDiffOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="applyAiSuggestion">{{ t('scripts.applyToEditor') }}</el-button>
      </template>
    </el-dialog>
    <el-dialog v-model="versionHistoryOpen" class="script-version-dialog" :title="t('scripts.versionHistory')" width="min(760px, calc(100vw - 48px))">
      <div class="script-version-list">
        <article v-for="version in scriptVersions" :key="version.id"><div><b>{{ formatDate(version.createdAt) }}</b><small>{{ version.name }}</small><pre>{{ outputPreview(version.content) }}</pre></div><el-button size="small" @click="restoreVersion(version.id)">{{ t('scripts.restoreVersion') }}</el-button></article>
        <OpsEmptyState v-if="!scriptVersions.length" :icon="Clock" :title="t('scripts.emptyVersions')" />
      </div>
    </el-dialog>
    <el-dialog v-model="scheduleEditOpen" class="script-schedule-dialog" :title="t('scripts.editSchedule')" width="min(640px, calc(100vw - 48px))" :close-on-click-modal="false">
      <div class="schedule-dialog-form"><label><span>{{ t('scripts.scheduleScript') }}</span><el-select v-model="scheduleEditDraft.scriptId"><el-option v-for="script in scriptStore.scripts" :key="script.id" :label="script.name" :value="script.id" /></el-select></label><label><span>{{ t('scripts.cronExpression') }}</span><el-input v-model="scheduleEditDraft.cron" placeholder="*/30 * * * *" /></label></div>
      <div class="schedule-preview" :class="{ invalid: !scheduleEditCronIsValid }"><span>{{ t('scripts.schedulePreview') }}</span><div v-if="scheduleEditPreviewTimes.length"><i v-for="time in scheduleEditPreviewTimes" :key="time">{{ formatDate(time) }}</i></div><small v-else>{{ t('scripts.schedulePreviewInvalid') }}</small></div>
      <div class="schedule-target-picker"><span>{{ t('scripts.executionTargets') }}</span><div><button v-for="server in sshStore.servers" :key="server.id" type="button" :class="{ active: scheduleEditTargets.has(server.id) }" @click="toggleScheduleEditTarget(server.id)">{{ server.name }}</button></div></div>
      <div class="schedule-edit-enabled"><el-switch v-model="scheduleEditDraft.enabled" :active-text="t('scripts.enabled')" :inactive-text="t('scripts.disabled')" /></div>
      <template #footer><el-button @click="scheduleEditOpen = false">{{ t('common.cancel') }}</el-button><el-button type="primary" @click="saveScheduleEdit">{{ t('common.save') }}</el-button></template>
    </el-dialog>
    <el-dialog v-model="executionPreviewOpen" class="script-execution-dialog" :title="t('scripts.executionPreviewTitle')" width="min(760px, calc(100vw - 48px))" :close-on-click-modal="false">
      <p class="execution-preview-hint">{{ t('scripts.executionPreviewHint') }}</p>
      <div v-if="scriptParameters.length" class="script-parameter-grid"><label v-for="name in scriptParameters" :key="name"><span>${{ '{' }}{{ name }}{{ '}' }}</span><el-input v-model="parameterValues[name]" :placeholder="t('scripts.parameterPlaceholder', { name })" /></label></div>
      <div class="execution-preview-command"><div><span>{{ t('scripts.finalCommand') }}</span><b :class="previewRisk">{{ t(`ai.risk_${previewRisk}`) }}</b></div><pre>{{ renderedScriptContent }}</pre></div>
      <div class="execution-preview-targets"><span>{{ t('scripts.executionTargets') }}</span><div><i v-for="server in selectedExecutionServers" :key="server.id">{{ server.name }}</i></div></div>
      <template #footer>
        <el-button @click="executionPreviewOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :disabled="!canConfirmExecution" @click="confirmRunNow"><el-icon :size="13"><VideoPlay /></el-icon>{{ t('scripts.confirmAndRun') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ArrowDown, ArrowUp, ChatDotRound, Clock, CopyDocument, Delete, Document, Download, EditPen, FullScreen, Lock, MagicStick, Plus, Timer, Upload, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLocale } from '@/composables/useLocale'
import { useSshStore } from '@/stores/ssh'
import { useScriptAutomationStore, type ScriptRunStatus } from '@/stores/scriptAutomation'
import { classifyCommand } from '@/utils/ops-permission'
import { isValidCron, nextCronTimes } from '@/utils/script-cron'
import { extractScriptParameters, renderScriptParameters } from '@/utils/script-parameters'
import OpsEmptyState from '@/components/OpsEmptyState.vue'

type Tab = 'editor' | 'schedules' | 'history'
type ScriptDraft = { id?: string; name: string; description: string; content: string; tags: string }
type SendScriptToAi = (name: string, content: string, prompt: string, scriptId?: string, mode?: 'draft' | 'review') => boolean | Promise<boolean>
type AiScriptSuggestion = { scriptId?: string; scriptName: string; originalContent: string; suggestedContent: string; mode: 'draft' | 'review'; risk: 'read_only' | 'change' | 'high_risk' | 'unknown'; reviewSummary: string }

const { t, locale } = useLocale()
const sshStore = useSshStore()
const scriptStore = useScriptAutomationStore()
const sendScriptToAI = inject<SendScriptToAi>('sendScriptToAI')
const activeTab = ref<Tab>('editor')
const activeScriptId = ref('')
const selectedTargets = reactive(new Set<string>())
const scheduleTargets = reactive(new Set<string>())
const expandedLogs = reactive(new Set<string>())
const scheduleDraft = reactive({ scriptId: '', cron: '0 * * * *' })
const cronIsValid = computed(() => isValidCron(scheduleDraft.cron))
const cronPreviewTimes = computed(() => cronIsValid.value ? nextCronTimes(scheduleDraft.cron) : [])
const scheduleEditOpen = ref(false)
const scheduleEditDraft = reactive({ id: '', scriptId: '', cron: '', enabled: true })
const scheduleEditTargets = reactive(new Set<string>())
const scheduleEditCronIsValid = computed(() => isValidCron(scheduleEditDraft.cron))
const scheduleEditPreviewTimes = computed(() => scheduleEditCronIsValid.value ? nextCronTimes(scheduleEditDraft.cron) : [])
const draft = reactive<ScriptDraft>({ id: undefined, name: '', description: '', content: '', tags: '' })
const focusEditorOpen = ref(false)
const focusEditorRef = ref<HTMLTextAreaElement>()
const scriptImportInput = ref<HTMLInputElement>()
const scriptPageRef = ref<HTMLElement>()
const libraryWidth = ref(258)
const aiDiffOpen = ref(false)
const aiSuggestion = ref<AiScriptSuggestion>()
const versionHistoryOpen = ref(false)
const executionPreviewOpen = ref(false)
const parameterValues = reactive<Record<string, string>>({})
const historyStatusFilter = ref<'all' | Exclude<ScriptRunStatus, 'running'>>('all')
const historyQuery = ref('')

const currentRisk = computed(() => classifyCommand(draft.content).risk)
const canRun = computed(() => Boolean(draft.id && draft.content.trim() && selectedTargets.size))
const selectedTargetIds = computed<string[]>({
  get: () => [...selectedTargets],
  set: (ids) => { selectedTargets.clear(); ids.forEach(id => selectedTargets.add(id)) },
})
const scriptVersions = computed(() => draft.id ? scriptStore.versionsFor(draft.id) : [])
const scriptParameters = computed(() => extractScriptParameters(draft.content))
const parametersComplete = computed(() => scriptParameters.value.every(name => parameterValues[name]?.trim()))
const renderedScriptContent = computed(() => renderScriptParameters(draft.content, parameterValues))
const previewRisk = computed(() => classifyCommand(renderedScriptContent.value).risk)
const selectedExecutionServers = computed(() => sshStore.servers.filter(server => selectedTargets.has(server.id)))
const canConfirmExecution = computed(() => Boolean(draft.id && selectedTargets.size && parametersComplete.value))
const filteredLogs = computed(() => {
  const query = historyQuery.value.trim().toLocaleLowerCase()
  return scriptStore.runLogs.filter(log => {
    const statusMatches = historyStatusFilter.value === 'all' || log.status === historyStatusFilter.value
    const textMatches = !query || `${log.scriptName} ${log.serverName} ${log.output}`.toLocaleLowerCase().includes(query)
    return statusMatches && textMatches
  })
})

function copyIntoDraft(script?: { id: string; name: string; description: string; content: string; tags: string[] }) {
  Object.assign(draft, script ? { id: script.id, name: script.name, description: script.description, content: script.content, tags: script.tags.join(', ') } : { id: undefined, name: '', description: '', content: '', tags: '' })
}

function selectScript(scriptId: string) {
  const script = scriptStore.scripts.find(item => item.id === scriptId)
  if (!script) return
  activeScriptId.value = scriptId
  copyIntoDraft(script)
  scheduleDraft.scriptId = scriptId
}

function newScript() { activeScriptId.value = ''; copyIntoDraft(); activeTab.value = 'editor' }
function exportLibrary() {
  const blob = new Blob([JSON.stringify(scriptStore.exportScriptLibrary(), null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aiterminal-script-library-${new Date().toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  ElMessage.success(t('scripts.libraryExported', { n: scriptStore.scripts.length }))
}
function triggerImport() { scriptImportInput.value?.click() }
async function importLibrary(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try { ElMessage.success(t('scripts.libraryImported', { n: scriptStore.importScriptLibrary(JSON.parse(await file.text())) })) } catch { ElMessage.error(t('scripts.libraryImportFailed')) }
}
function toggleScheduleTarget(id: string) { scheduleTargets.has(id) ? scheduleTargets.delete(id) : scheduleTargets.add(id) }
function serverStatus(serverId: string) { return sshStore.sessions.some(session => session.serverId === serverId && session.status === 'connected') ? 'connected' : 'offline' }
function scriptRisk(content: string) { return classifyCommand(content).risk }
function scriptName(scriptId: string) { return scriptStore.scripts.find(script => script.id === scriptId)?.name || t('scripts.missingScript') }

function saveScript() {
  if (!draft.content.trim()) { ElMessage.warning(t('scripts.contentRequired')); return }
  const script = scriptStore.upsertScript({ id: draft.id, name: draft.name, description: draft.description, content: draft.content, tags: draft.tags.split(',') })
  activeScriptId.value = script.id
  scheduleDraft.scriptId = script.id
  copyIntoDraft(script)
  ElMessage.success(t('scripts.saved'))
}

function duplicateScript() {
  if (!draft.id || !draft.content.trim()) return
  const script = scriptStore.upsertScript({ name: `${draft.name || t('scripts.untitledScript')} ${t('scripts.copySuffix')}`, description: draft.description, content: draft.content, tags: draft.tags.split(',') })
  selectScript(script.id)
  ElMessage.success(t('scripts.scriptDuplicated'))
}

async function deleteScript() {
  if (!draft.id) return
  const scheduleCount = scriptStore.schedules.filter(schedule => schedule.scriptId === draft.id).length
  try {
    await ElMessageBox.confirm(t('scripts.deleteScriptConfirm', { n: scheduleCount }), t('common.confirm'), { type: 'warning', confirmButtonText: t('common.delete'), cancelButtonText: t('common.cancel') })
    scriptStore.removeScript(draft.id)
    newScript()
    ElMessage.success(t('scripts.scriptDeleted'))
  } catch {}
}

function openFocusEditor() {
  focusEditorOpen.value = true
  nextTick(() => focusEditorRef.value?.focus())
}

function saveAndCloseFocusEditor() {
  saveScript()
  if (draft.id) focusEditorOpen.value = false
}

function resetLibraryWidth() { libraryWidth.value = 258 }
function onLibraryResizeStart(event: PointerEvent) {
  const pageWidth = scriptPageRef.value?.clientWidth || 0
  if (pageWidth < 620 || window.matchMedia('(max-width: 820px)').matches) return
  const startX = event.clientX
  const startWidth = libraryWidth.value
  const maxWidth = Math.min(440, Math.max(200, pageWidth - 400))
  const onMove = (moveEvent: PointerEvent) => {
    libraryWidth.value = Math.min(maxWidth, Math.max(200, startWidth + (moveEvent.clientX - startX)))
  }
  const onEnd = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd, { once: true })
}

function runNow() {
  if (!draft.id) { saveScript(); if (!draft.id) return }
  if (!selectedTargets.size) { ElMessage.warning(t('scripts.targetRequired')); return }
  scriptParameters.value.forEach(name => { if (parameterValues[name] === undefined) parameterValues[name] = '' })
  executionPreviewOpen.value = true
}

async function confirmRunNow() {
  if (!draft.id) return
  if (!parametersComplete.value) { ElMessage.warning(t('scripts.parametersRequired')); return }
  try {
    await scriptStore.executeScript(draft.id, [...selectedTargets], undefined, renderedScriptContent.value)
    executionPreviewOpen.value = false
    activeTab.value = 'history'
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}

async function askAi(mode: 'draft' | 'review') {
  const name = draft.name.trim() || t('scripts.untitled')
  const prompt = mode === 'draft'
    ? t('scripts.aiDraftPrompt')
    : t('scripts.aiReviewPrompt')
  if (!sendScriptToAI) { ElMessage.warning(t('scripts.aiUnavailable')); return }
  if (await sendScriptToAI(name, draft.content, prompt, draft.id, mode)) ElMessage.success(t('scripts.aiSent'))
}

function extractScriptFromAiResponse(response: string): string {
  const block = response.match(/```(?:bash|shell|sh)?\s*\n([\s\S]*?)```/i)
  return (block?.[1] || '').trim()
}

function reviewSummary(response: string) { return response.replace(/```[\s\S]*?```/g, '').replace(/\s+/g, ' ').trim().slice(0, 260) }
function onAiScriptResponse(event: Event) {
  const detail = (event as CustomEvent<{ scriptId?: string; scriptName: string; originalContent: string; response: string; mode: 'draft' | 'review' }>).detail
  if (!detail) return
  const suggestedContent = extractScriptFromAiResponse(detail.response)
  if (!suggestedContent) { ElMessage.warning(t('scripts.aiNoScriptFound')); return }
  if (detail.scriptId && detail.scriptId !== draft.id) selectScript(detail.scriptId)
  const risk = classifyCommand(suggestedContent).risk
  aiSuggestion.value = { scriptId: detail.scriptId, scriptName: detail.scriptName, originalContent: detail.originalContent, suggestedContent, mode: detail.mode, risk, reviewSummary: reviewSummary(detail.response) }
  aiDiffOpen.value = true
}

function applyAiSuggestion() {
  if (!aiSuggestion.value) return
  draft.content = aiSuggestion.value.suggestedContent
  aiDiffOpen.value = false
  ElMessage.success(t('scripts.aiApplied'))
}

async function restoreVersion(versionId: string) {
  try { await ElMessageBox.confirm(t('scripts.restoreVersionConfirm'), t('common.confirm'), { type: 'warning', confirmButtonText: t('scripts.restoreVersion'), cancelButtonText: t('common.cancel') }) } catch { return }
  const script = scriptStore.restoreVersion(versionId)
  if (!script) return
  selectScript(script.id)
  versionHistoryOpen.value = false
  ElMessage.success(t('scripts.versionRestored'))
}

function createSchedule() {
  const script = scriptStore.scripts.find(item => item.id === scheduleDraft.scriptId)
  if (!script) { ElMessage.warning(t('scripts.scheduleScriptRequired')); return }
  if (extractScriptParameters(script.content).length) { ElMessage.warning(t('scripts.scheduleParametersUnsupported')); return }
  if (!scheduleTargets.size) { ElMessage.warning(t('scripts.targetRequired')); return }
  if (!isValidCron(scheduleDraft.cron)) { ElMessage.warning(t('scripts.invalidCron')); return }
  scriptStore.saveSchedule({ scriptId: script.id, targetIds: [...scheduleTargets], cron: scheduleDraft.cron, enabled: true })
  ElMessage.success(t('scripts.scheduleCreated'))
}

function openScheduleEditor(scheduleId: string) {
  const schedule = scriptStore.schedules.find(item => item.id === scheduleId)
  if (!schedule) return
  Object.assign(scheduleEditDraft, { id: schedule.id, scriptId: schedule.scriptId, cron: schedule.cron, enabled: schedule.enabled })
  scheduleEditTargets.clear()
  schedule.targetIds.forEach(id => scheduleEditTargets.add(id))
  scheduleEditOpen.value = true
}

function toggleScheduleEditTarget(id: string) { scheduleEditTargets.has(id) ? scheduleEditTargets.delete(id) : scheduleEditTargets.add(id) }

function saveScheduleEdit() {
  const script = scriptStore.scripts.find(item => item.id === scheduleEditDraft.scriptId)
  if (!script) { ElMessage.warning(t('scripts.scheduleScriptRequired')); return }
  if (extractScriptParameters(script.content).length) { ElMessage.warning(t('scripts.scheduleParametersUnsupported')); return }
  if (!scheduleEditTargets.size) { ElMessage.warning(t('scripts.targetRequired')); return }
  if (!scheduleEditCronIsValid.value) { ElMessage.warning(t('scripts.invalidCron')); return }
  scriptStore.saveSchedule({ id: scheduleEditDraft.id, scriptId: script.id, targetIds: [...scheduleEditTargets], cron: scheduleEditDraft.cron, enabled: scheduleEditDraft.enabled })
  scheduleEditOpen.value = false
  ElMessage.success(t('scripts.scheduleUpdated'))
}

async function runScheduleNow(scheduleId: string) {
  const schedule = scriptStore.schedules.find(item => item.id === scheduleId)
  if (!schedule) return
  try { await scriptStore.runScheduleNow(schedule.id); activeTab.value = 'history' } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}

async function removeSchedule(scheduleId: string) {
  try { await ElMessageBox.confirm(t('scripts.removeScheduleConfirm'), t('common.confirm'), { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }); scriptStore.removeSchedule(scheduleId) } catch {}
}

function toggleLog(logId: string) { expandedLogs.has(logId) ? expandedLogs.delete(logId) : expandedLogs.add(logId) }
function outputPreview(value: string) { return value.replace(/\s+/g, ' ').trim().slice(0, 160) || t('scripts.noOutput') }
function formatDate(value: number) { return new Date(value).toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function statusLabel(status: ScriptRunStatus) { return t(`scripts.status_${status}`) }
function csvCell(value: string | number) { return `"${String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"` }
function exportHistory() {
  if (!filteredLogs.value.length) { ElMessage.warning(t('scripts.emptyFilteredHistory')); return }
  const rows = [[t('scripts.exportScript'), t('scripts.exportServer'), t('scripts.exportStatus'), t('scripts.exportStartedAt'), t('scripts.exportOutput')], ...filteredLogs.value.map(log => [log.scriptName, log.serverName, statusLabel(log.status), formatDate(log.startedAt), log.output || t('scripts.noOutput')])]
  const blob = new Blob([`\uFEFF${rows.map(row => row.map(csvCell).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `aiterminal-script-runs-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  ElMessage.success(t('scripts.historyExported', { n: filteredLogs.value.length }))
}

async function clearHistory() {
  if (!filteredLogs.value.length) return
  try {
    await ElMessageBox.confirm(t('scripts.clearHistoryConfirm', { n: filteredLogs.value.length }), t('common.confirm'), { type: 'warning', confirmButtonText: t('scripts.clearHistory'), cancelButtonText: t('common.cancel') })
    scriptStore.clearRunLogs(filteredLogs.value.map(log => log.id))
    expandedLogs.clear()
    ElMessage.success(t('scripts.historyCleared'))
  } catch {}
}

onMounted(() => {
  if (!sshStore.servers.length) sshStore.init()
  scriptStore.init()
  const first = scriptStore.scripts[0]
  if (first) selectScript(first.id)
  window.addEventListener('aiterminal:script-ai-response', onAiScriptResponse)
})

onUnmounted(() => window.removeEventListener('aiterminal:script-ai-response', onAiScriptResponse))
</script>

<style lang="scss" scoped>
.script-page { display: flex; height: 100%; min-height: 0; overflow: hidden; background: $shell-workspace-bg; font-family: "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif; font-size: 12px; line-height: 1.45; letter-spacing: 0; }
.script-library { width: var(--script-library-width, 258px); flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid $color-border-light; background: $color-bg-surface; container-type: inline-size; container-name: script-library; }
.script-library-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 8px 10px; padding: 14px 12px 9px;
  > div:first-child { min-width: 0; flex: 1 1 126px; }
  h2 { margin: 2px 0 0; color: $color-text-primary; font-size: 18px; font-weight: 600; line-height: 1.35; letter-spacing: 0; }
}
.script-library-actions { display: flex; flex: 0 0 auto; flex-wrap: nowrap; justify-content: flex-end; gap: 4px; :deep(.el-button) { margin: 0; font-family: inherit; letter-spacing: 0; } }.script-library-icon-button { width: 28px; height: 28px; padding: 0; }.script-library-new-button { min-width: 58px; padding-inline: 8px; font-weight: 500; }.script-import-input { display: none; }
.script-eyebrow { color: $color-primary; font-size: 10px; font-weight: 650; letter-spacing: .08em; }
.script-library-meta { display: flex; justify-content: space-between; padding: 0 12px 10px; color: $color-text-placeholder; font-size: 11px; border-bottom: 1px solid $color-border-light;
  span { display: inline-flex; align-items: center; gap: 4px; } i { width: 6px; height: 6px; border-radius: 50%; background: $color-success; }
}
.script-list { flex: 1; overflow-y: auto; padding: 8px; }
.script-list-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; text-align: left; color: $color-text-secondary; cursor: pointer; font: inherit;
  &:hover { background: $color-bg-hover; color: $color-text-primary; } &.active { background: $color-bg-active; border-color: $color-border-light; color: $color-text-primary; }
}
.script-file-icon { width: 29px; height: 29px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; color: $color-primary; background: $color-bg-active; flex-shrink: 0; }
.script-list-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; font-weight: 600; } small { overflow: hidden; color: $color-text-placeholder; font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; } }
.script-risk-dot { width: 7px; height: 7px; border-radius: 50%; background: $color-success; flex-shrink: 0; &.change, &.unknown { background: $color-warning; } &.high_risk { background: $color-danger; } }
.script-library-resize { flex: 0 0 9px; display: flex; align-items: center; justify-content: center; cursor: col-resize; touch-action: none; background: $color-bg-surface; &:hover, &:active { background: $color-bg-active; } span { width: 2px; height: 44px; border-radius: 99px; background: $color-border; transition: height .16s ease, background .16s ease; } &:hover span, &:active span { height: 62px; background: $color-primary; } }

.script-workspace { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; overflow: hidden; container-type: inline-size; container-name: script-workspace; }
.script-page-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 16px; flex-shrink: 0; }
.script-tabs { display: inline-flex; gap: 2px; padding: 2px; border: 1px solid $color-border-light; border-radius: 8px; background: $color-bg-input;
  button { display: inline-flex; align-items: center; gap: 5px; border: 0; padding: 5px 10px; border-radius: 6px; background: transparent; color: $color-text-secondary; cursor: pointer; font: inherit; font-size: 11px; &.active { background: $color-bg-active; color: $color-primary; font-weight: 650; } }
  i { min-width: 15px; padding: 0 3px; border-radius: 8px; background: $color-bg-hover; color: inherit; font-size: 9px; font-style: normal; }
}
.script-head-status { display: inline-flex; align-items: center; gap: 5px; color: $color-success; font-size: 10px; span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 3px $color-bg-success-hover; } }

.script-editor-view { flex: 1; display: grid; grid-template-columns: minmax(0, 1fr) 9px var(--script-target-panel-width, 260px); min-height: 0; overflow: hidden; }
.script-editor-main { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 16px; container-type: inline-size; container-name: script-editor; }
.script-form-head { display: flex; flex-direction: column; gap: 12px; align-items: stretch; margin-bottom: 12px; }.script-form-fields { display: grid; gap: 2px; min-width: 0; }.script-form-actions { display: flex; width: 100%; max-width: 100%; gap: 6px; flex-wrap: wrap; justify-content: flex-start; }.script-form-actions :deep(.el-button) { margin: 0; }
.script-form-fields :deep(.el-input__wrapper) { padding: 0 2px; border: 0 !important; border-radius: 0; background: transparent !important; box-shadow: none !important; }.script-form-fields :deep(.el-input__inner) { background: transparent !important; }.script-name-input :deep(.el-input__inner) { height: 30px; font-size: 15px; font-weight: 600; color: $color-text-primary; letter-spacing: 0; }.script-description-input :deep(.el-input__inner) { height: 24px; color: $color-text-secondary; font-size: 12px; letter-spacing: 0; }
.script-editor-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; color: $color-text-secondary; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .5px; }.script-language { color: $color-primary; font-family: $font-family-mono; }
.script-editor { flex: 1; min-height: 250px; resize: none; padding: 13px; border: 1px solid $color-border; border-radius: 9px; outline: none; background: $color-bg-input; color: $color-text-primary; font: 12px/1.65 $font-family-mono; tab-size: 2; &:focus { border-color: $color-primary; box-shadow: 0 0 0 2px $color-bg-active; } }
.script-form-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding-top: 10px; }.script-tags-input { flex: 1 1 180px; min-width: 0; max-width: 320px; }.script-updated { flex: 1 1 130px; color: $color-text-placeholder; font-size: 10px; }
.script-focus-button { font-weight: 700; letter-spacing: .1px; box-shadow: 0 3px 10px $color-bg-active; }
.script-editor-resize { position: relative; display: flex; align-items: center; justify-content: center; cursor: col-resize; touch-action: none; background: $color-bg-surface; &:hover, &:active { background: $color-bg-active; } span { width: 2px; height: 34px; border-radius: 99px; background: $color-border; transition: height .16s ease, background .16s ease; } &:hover span, &:active span { height: 52px; background: $color-primary; } }
.script-execution-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 16px 13px; border-left: 1px solid $color-border-light; background: $color-bg-surface; }.script-panel-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: $color-text-primary; font-size: 12px; font-weight: 650; small { color: $color-text-placeholder; font-size: 10px; font-weight: 400; } }.script-target-list { flex: 1; min-height: 100px; overflow-y: auto; margin: 9px 0; }.script-target { display: flex; align-items: center; gap: 7px; padding: 7px; border-radius: 7px; cursor: pointer; &:hover, &.selected { background: $color-bg-hover; } input { accent-color: $color-primary; } i { width: 6px; height: 6px; border-radius: 50%; background: $color-text-muted; &.connected { background: $color-success; } } span { min-width: 0; display: flex; flex-direction: column; b, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } b { color: $color-text-primary; font-size: 11px; } small { color: $color-text-placeholder; font: 9px $font-family-mono; } } }.script-target-empty { color: $color-text-placeholder; font-size: 11px; text-align: center; }
.script-risk-card { margin-top: auto; padding: 9px; border: 1px solid $color-border-light; border-radius: 8px; background: $color-bg-hover; color: $color-success; div { display: flex; align-items: center; gap: 5px; font-size: 11px; } p { margin: 5px 0 0; color: $color-text-secondary; font-size: 10px; line-height: 1.45; } &.change, &.unknown { color: $color-warning; } &.high_risk { color: $color-danger; } }.script-run-btn { width: 100%; margin-top: 9px; }.script-scheduler-note { margin: 8px 0 0; color: $color-text-placeholder; font-size: 9px; line-height: 1.45; }

.script-schedules-view, .script-history-view { flex: 1; overflow-y: auto; padding: 16px; }.schedule-create-card, .schedule-item, .history-summary, .script-log { border: 1px solid $glass-border; border-radius: 9px; background: $glass-bg; box-shadow: $elevation-1; }.schedule-create-card { padding: 14px; }.schedule-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; h3 { margin: 3px 0 0; font-size: 15px; color: $color-text-primary; } }.schedule-enabled { padding: 3px 6px; border-radius: 5px; color: $color-success; background: $color-bg-success-hover; font-size: 10px; }.schedule-form-grid { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(150px, 1fr); gap: 10px; margin-top: 14px; label { display: grid; gap: 5px; color: $color-text-secondary; font-size: 10px; } }.schedule-preview { display: grid; gap: 6px; margin-top: 10px; padding: 8px 9px; border: 1px solid $color-border-light; border-radius: 7px; background: $color-bg-hover; color: $color-text-secondary; font-size: 10px; > div { display: flex; flex-wrap: wrap; gap: 5px; } i { padding: 3px 6px; border-radius: 4px; background: $color-bg-input; color: $color-primary; font: 9px $font-family-mono; font-style: normal; } small { color: $color-warning; font-size: 10px; } &.invalid { border-color: $color-warning; } }.schedule-target-picker { display: grid; gap: 6px; margin-top: 12px; color: $color-text-secondary; font-size: 10px; div { display: flex; flex-wrap: wrap; gap: 5px; } button { border: 1px solid $color-border-light; border-radius: 999px; padding: 3px 8px; background: $color-bg-input; color: $color-text-secondary; cursor: pointer; font: inherit; font-size: 10px; &.active { color: $color-primary; border-color: $color-primary; background: $color-bg-active; } } }.schedule-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 13px; color: $color-text-placeholder; font-size: 10px; }.schedule-list { display: grid; gap: 8px; margin-top: 14px; }.schedule-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; &.disabled { opacity: .62; } &.failed { border-color: $color-danger; } }.schedule-icon { width: 31px; height: 31px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; color: $color-primary; background: $color-bg-active; }.schedule-copy { min-width: 0; flex: 1; display: grid; gap: 2px; b { color: $color-text-primary; font-size: 12px; } span, small { color: $color-text-secondary; font-size: 10px; } small { color: $color-text-placeholder; } code { padding: 1px 4px; border-radius: 3px; color: $color-primary; background: $color-bg-active; font-family: $font-family-mono; } }.schedule-state { font-weight: 650; &.success { color: $color-success; } &.failed { color: $color-danger; } &.skipped { color: $color-text-secondary; } &.running, &.retry { color: $color-warning; } }.schedule-failure-alert { color: $color-danger !important; }.schedule-delete { color: $color-danger !important; }
.history-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 13px; color: $color-text-primary; font-size: 13px; font-weight: 650; > div:first-child { display: grid; gap: 2px; } small { color: $color-text-placeholder; font-size: 10px; font-weight: 400; } }.history-actions { display: flex; align-items: center; gap: 6px; min-width: 0; :deep(.el-select) { width: 104px; flex-shrink: 0; } :deep(.el-input) { width: min(190px, 20vw); min-width: 112px; } :deep(.el-button) { margin: 0; flex-shrink: 0; } }.script-log-list { display: grid; gap: 7px; margin-top: 12px; }.script-log { overflow: hidden; &.success { border-left: 3px solid $color-success; } &.failed { border-left: 3px solid $color-danger; } &.skipped { border-left: 3px solid $color-text-muted; } }.script-log-head { display: flex; align-items: center; gap: 7px; padding: 9px 11px; b { color: $color-text-primary; font-size: 12px; }.script-log-server { color: $color-text-secondary; font-size: 10px; }.script-log-badge { padding: 1px 5px; border-radius: 4px; color: $color-text-secondary; background: $color-bg-hover; font-size: 9px; }.script-log-time { margin-left: auto; color: $color-text-placeholder; font: 9px $font-family-mono; }.script-log-status { width: 7px; height: 7px; border-radius: 50%; background: $color-warning; }.success .script-log-status { background: $color-success; }.failed .script-log-status { background: $color-danger; } button { border: 0; background: transparent; color: $color-text-secondary; cursor: pointer; } }.script-log p, .script-log pre { margin: 0; padding: 8px 11px; border-top: 1px solid $color-border-light; color: $color-text-secondary; font: 10px/1.5 $font-family-mono; }.script-log p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.script-log pre { max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: $color-text-regular; }

@media (max-width: 1040px) { .script-editor-view { grid-template-columns: minmax(0, 1fr) 9px 230px; }.script-form-head { flex-direction: column; }.script-form-actions { justify-content: flex-start; } }
@media (max-width: 820px) { .script-page { flex-direction: column; }.script-library { width: auto; max-height: 190px; border-right: 0; border-bottom: 1px solid $color-border-light; }.script-library-resize { display: none; }.script-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }.script-editor-view { grid-template-columns: 1fr; overflow-y: auto; }.script-editor-resize { display: none; }.script-editor-main { min-height: 430px; }.script-execution-panel { border-left: 0; border-top: 1px solid $color-border-light; min-height: 280px; }.script-target-list { max-height: 130px; }.script-workspace { overflow: hidden; } }
@media (max-width: 560px) { .script-library-head { align-items: stretch; flex-direction: column; }.script-library-actions { justify-content: flex-start; }.script-page-head, .history-summary, .schedule-card-foot { align-items: flex-start; flex-direction: column; }.history-actions { width: 100%; flex-wrap: wrap; :deep(.el-input) { flex: 1; width: auto; } }.script-head-status { align-self: flex-end; }.script-tabs { width: 100%; overflow-x: auto; }.schedule-form-grid { grid-template-columns: 1fr; }.schedule-item { flex-wrap: wrap; }.schedule-copy { min-width: calc(100% - 44px); }.script-log-head { flex-wrap: wrap; }.script-log-time { margin-left: 0; }.script-editor-main, .script-schedules-view, .script-history-view { padding: 11px; } }
@container script-library (max-width: 225px) { .script-library-head { align-items: stretch; }.script-library-actions { width: 100%; justify-content: flex-start; }.script-library-new-button { width: 28px; min-width: 28px; padding: 0; }.script-library-new-button span { display: none; }.script-library-meta { gap: 6px; flex-wrap: wrap; } }
@container script-workspace (max-width: 480px) { .script-form-head { flex-direction: column; }.script-form-fields { width: 100%; flex-basis: auto; }.script-form-actions { width: 100%; margin-left: 0; justify-content: flex-start; }.script-editor-view { grid-template-columns: 1fr; overflow-y: auto; }.script-editor-resize { display: none; }.script-editor-main { min-height: 430px; }.script-execution-panel { border-left: 0; border-top: 1px solid $color-border-light; min-height: 280px; }.script-target-list { max-height: 130px; } }
@container script-editor (max-width: 420px) { .script-form-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }.script-form-actions :deep(.el-button) { width: 100%; min-width: 0; padding-inline: 6px; font-size: 10px; }.script-form-actions .script-focus-button { grid-column: 1 / -1; padding-inline: 10px; font-size: 11px; } }
:deep(.script-focus-dialog) { --el-dialog-bg-color: #{$color-bg-surface}; border: 1px solid $color-border; border-radius: 12px; box-shadow: $elevation-3; .el-dialog__header { margin-right: 0; padding: 18px 20px 13px; border-bottom: 1px solid $color-border-light; }.el-dialog__title { color: $color-text-primary; font-size: 16px; font-weight: 700; }.el-dialog__body { padding: 16px 20px; }.el-dialog__footer { padding: 12px 20px 16px; border-top: 1px solid $color-border-light; } }
.focus-editor-hint { margin: 0 0 13px; color: $color-text-secondary; font-size: 12px; }.focus-editor-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 10px; }.focus-editor-label { display: flex; justify-content: space-between; margin: 15px 0 6px; color: $color-text-secondary; font-size: 11px; font-weight: 650; span:last-child { color: $color-primary; font-family: $font-family-mono; } }.focus-script-editor { display: block; box-sizing: border-box; width: 100%; height: min(58vh, 620px); min-height: 360px; resize: vertical; padding: 15px; border: 1px solid $color-border; border-radius: 9px; outline: none; background: $color-bg-input; color: $color-text-primary; font: 13px/1.7 $font-family-mono; &:focus { border-color: $color-primary; box-shadow: 0 0 0 2px $color-bg-active; } }
:deep(.script-ai-diff-dialog) { --el-dialog-bg-color: #{$color-bg-surface}; border: 1px solid $color-border; border-radius: 12px; box-shadow: $elevation-3; .el-dialog__header { margin-right: 0; padding: 18px 20px 13px; border-bottom: 1px solid $color-border-light; }.el-dialog__title { color: $color-text-primary; font-size: 16px; font-weight: 700; }.el-dialog__body { padding: 16px 20px; }.el-dialog__footer { padding: 12px 20px 16px; border-top: 1px solid $color-border-light; } }
.ai-diff-hint { margin: 0 0 13px; color: $color-text-secondary; font-size: 12px; }.ai-diff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }.ai-diff-grid section { display: grid; gap: 6px; min-width: 0; }.ai-diff-grid section > span { color: $color-text-secondary; font-size: 11px; font-weight: 650; }.ai-diff-grid section:last-child > span { color: $color-primary; }.ai-diff-grid pre { min-height: 360px; max-height: 58vh; margin: 0; overflow: auto; padding: 13px; border: 1px solid $color-border; border-radius: 9px; background: $color-bg-input; color: $color-text-primary; font: 12px/1.65 $font-family-mono; white-space: pre-wrap; word-break: break-word; }.ai-diff-grid section:last-child pre { border-color: $color-primary; background: $color-bg-active; }
.ai-review-summary { display: grid; gap: 5px; margin-top: 13px; padding: 10px 12px; border: 1px solid $color-border-light; border-left: 3px solid $color-success; border-radius: 8px; background: $color-bg-hover; color: $color-text-secondary; font-size: 11px; line-height: 1.55; &.change, &.unknown { border-left-color: $color-warning; } &.high_risk { border-left-color: $color-danger; } b { color: $color-text-primary; font-size: 12px; } }
.script-version-list { display: grid; gap: 8px; }.script-version-list article { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px; border: 1px solid $color-border-light; border-radius: 8px; background: $color-bg-hover; }.script-version-list article > div { min-width: 0; flex: 1; display: grid; gap: 3px; }.script-version-list b { color: $color-text-primary; font-size: 11px; }.script-version-list small { color: $color-text-secondary; font-size: 10px; }.script-version-list pre { margin: 2px 0 0; overflow: hidden; color: $color-text-placeholder; font: 10px/1.4 $font-family-mono; white-space: nowrap; text-overflow: ellipsis; }
.execution-preview-hint { margin: 0 0 14px; color: $color-text-secondary; font-size: 12px; line-height: 1.55; }.script-parameter-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; label { display: grid; gap: 5px; min-width: 0; span { color: $color-primary; font: 11px $font-family-mono; } } }.execution-preview-command { display: grid; gap: 6px; padding: 11px; border: 1px solid $color-border-light; border-radius: 9px; background: $color-bg-hover; > div { display: flex; align-items: center; justify-content: space-between; gap: 8px; color: $color-text-secondary; font-size: 10px; } b { color: $color-success; font-size: 10px; &.change, &.unknown { color: $color-warning; } &.high_risk { color: $color-danger; } } pre { max-height: 230px; margin: 0; overflow: auto; color: $color-text-primary; font: 11px/1.6 $font-family-mono; white-space: pre-wrap; word-break: break-word; } }.execution-preview-targets { display: grid; gap: 6px; margin-top: 14px; color: $color-text-secondary; font-size: 11px; > div { display: flex; flex-wrap: wrap; gap: 5px; } i { padding: 3px 7px; border-radius: 999px; background: $color-bg-active; color: $color-primary; font-size: 10px; font-style: normal; } }
.script-delete-button, .history-clear { color: $color-danger; }
.schedule-dialog-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; label { display: grid; gap: 5px; color: $color-text-secondary; font-size: 11px; } }.schedule-edit-enabled { margin-top: 14px; }
:deep(.script-schedule-dialog) { --el-dialog-bg-color: #{$color-bg-surface}; border: 1px solid $color-border; border-radius: 12px; box-shadow: $elevation-3; .el-dialog__header { margin-right: 0; padding: 18px 20px 13px; border-bottom: 1px solid $color-border-light; }.el-dialog__title { color: $color-text-primary; font-size: 16px; font-weight: 700; }.el-dialog__body { padding: 16px 20px; }.el-dialog__footer { padding: 12px 20px 16px; border-top: 1px solid $color-border-light; } }
:deep(.script-execution-dialog) { --el-dialog-bg-color: #{$color-bg-surface}; border: 1px solid $color-border; border-radius: 12px; box-shadow: $elevation-3; .el-dialog__header { margin-right: 0; padding: 18px 20px 13px; border-bottom: 1px solid $color-border-light; }.el-dialog__title { color: $color-text-primary; font-size: 16px; font-weight: 700; }.el-dialog__body { padding: 16px 20px; }.el-dialog__footer { padding: 12px 20px 16px; border-top: 1px solid $color-border-light; } }
@media (max-width: 640px) { .focus-editor-fields { grid-template-columns: 1fr; }.focus-script-editor { min-height: 280px; } }
@media (max-width: 760px) { .ai-diff-grid { grid-template-columns: 1fr; }.ai-diff-grid pre { min-height: 220px; max-height: 34vh; } }
.script-editor-view { flex: 1; display: flex; min-height: 0; overflow: hidden; }.script-editor-main { flex: 1; }.script-target-select-row { display: grid; grid-template-columns: minmax(105px, auto) minmax(0, 1fr); align-items: center; gap: 10px; margin-bottom: 12px; padding: 8px 10px; border: 1px solid $color-border-light; border-radius: 8px; background: $color-bg-hover; > div { display: grid; gap: 2px; } span { color: $color-text-primary; font-size: 11px; font-weight: 650; } small { color: $color-text-placeholder; font-size: 9px; } :deep(.el-select) { min-width: 0; } }.script-target-option { display: flex; align-items: center; gap: 6px; min-width: 0; width: 100%; i { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: $color-text-muted; &.connected { background: $color-success; } } b { overflow: hidden; color: $color-text-primary; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; } small { margin-left: auto; overflow: hidden; color: $color-text-placeholder; font: 9px $font-family-mono; text-overflow: ellipsis; white-space: nowrap; } }.script-execution-footer { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: 10px; margin-top: 12px; }.script-execution-footer .script-risk-card { margin-top: 0; }.script-execution-actions { display: grid; justify-items: end; gap: 7px; }.script-execution-actions .script-scheduler-note { max-width: 260px; margin: 0; text-align: right; }.script-execution-actions .script-run-btn { width: auto; min-width: 146px; margin: 0; }
@media (max-width: 640px) { .script-target-select-row, .script-execution-footer { grid-template-columns: 1fr; }.script-execution-actions { justify-items: stretch; }.script-execution-actions .script-scheduler-note { max-width: none; text-align: left; }.script-execution-actions .script-run-btn { width: 100%; }.script-target-option small { display: none; } }
</style>
