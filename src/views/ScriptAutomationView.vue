<template>
  <div ref="scriptPageRef" class="script-page">
    <aside class="script-library" :style="{ '--script-library-width': `${libraryWidth}px` }">
      <div class="script-library-head">
        <div>
          <span class="script-eyebrow">AUTOMATION STUDIO</span>
          <h2>{{ t('scripts.title') }}</h2>
        </div>
        <el-button type="primary" size="small" @click="newScript"><el-icon :size="13"><Plus /></el-icon>{{ t('scripts.newScript') }}</el-button>
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

      <section v-if="activeTab === 'editor'" ref="editorViewRef" class="script-editor-view" :style="{ '--script-target-panel-width': `${targetPanelWidth}px` }">
        <div class="script-editor-main">
          <div class="script-form-head">
            <div class="script-form-fields">
              <el-input v-model="draft.name" class="script-name-input" :placeholder="t('scripts.namePlaceholder')" />
              <el-input v-model="draft.description" class="script-description-input" :placeholder="t('scripts.descriptionPlaceholder')" />
            </div>
            <div class="script-form-actions">
              <el-button class="script-focus-button" type="primary" size="small" @click="openFocusEditor"><el-icon :size="14"><FullScreen /></el-icon>{{ t('scripts.focusEdit') }}</el-button>
              <el-button size="small" @click="askAi('draft')"><el-icon :size="13"><MagicStick /></el-icon>{{ t('scripts.aiDraft') }}</el-button>
              <el-button size="small" @click="askAi('review')"><el-icon :size="13"><ChatDotRound /></el-icon>{{ t('scripts.aiReview') }}</el-button>
              <el-button type="primary" size="small" @click="saveScript">{{ t('common.save') }}</el-button>
            </div>
          </div>

          <div class="script-editor-label"><span>{{ t('scripts.scriptContent') }}</span><span class="script-language">SHELL</span></div>
          <textarea v-model="draft.content" class="script-editor" spellcheck="false" :placeholder="t('scripts.contentPlaceholder')"></textarea>
          <div class="script-form-foot">
            <el-input v-model="draft.tags" size="small" :placeholder="t('scripts.tagsPlaceholder')" class="script-tags-input" />
            <span class="script-updated">{{ draft.id ? t('scripts.localSaved') : t('scripts.newUnsaved') }}</span>
          </div>
        </div>

        <div
          class="script-editor-resize"
          role="separator"
          aria-orientation="vertical"
          :aria-label="t('scripts.resizeTargets')"
          @pointerdown="onTargetResizeStart"
          @dblclick="resetTargetPanelWidth"
        ><span></span></div>

        <aside class="script-execution-panel">
          <div class="script-panel-title"><span>{{ t('scripts.executionTargets') }}</span><small>{{ t('scripts.selectedServers', { n: selectedTargets.size }) }}</small></div>
          <div class="script-target-list">
            <label v-for="server in sshStore.servers" :key="server.id" class="script-target" :class="{ selected: selectedTargets.has(server.id) }">
              <input type="checkbox" :checked="selectedTargets.has(server.id)" @change="toggleTarget(server.id)" />
              <i :class="serverStatus(server.id)"></i>
              <span><b>{{ server.name }}</b><small>{{ server.username }}@{{ server.host }}</small></span>
            </label>
            <p v-if="!sshStore.servers.length" class="script-target-empty">{{ t('workspace.noHosts') }}</p>
          </div>
          <div class="script-risk-card" :class="currentRisk">
            <div><el-icon :size="15"><Lock /></el-icon><b>{{ t(`ai.risk_${currentRisk}`) }}</b></div>
            <p>{{ currentRisk === 'read_only' ? t('scripts.readonlyHint') : t('scripts.changeHint') }}</p>
          </div>
          <el-button class="script-run-btn" type="primary" :loading="scriptStore.runningScriptIds.includes(draft.id || '')" :disabled="!canRun" @click="runNow">
            <el-icon :size="14"><VideoPlay /></el-icon>{{ t('scripts.runNow') }}
          </el-button>
          <p class="script-scheduler-note">{{ t('scripts.schedulerHint') }}</p>
        </aside>
      </section>

      <section v-else-if="activeTab === 'schedules'" class="script-schedules-view">
        <div class="schedule-create-card">
          <div class="schedule-card-head"><div><span class="script-eyebrow">CRON</span><h3>{{ t('scripts.newSchedule') }}</h3></div><span class="schedule-readonly">{{ t('scripts.readonlyOnly') }}</span></div>
          <div class="schedule-form-grid">
            <label><span>{{ t('scripts.scheduleScript') }}</span><el-select v-model="scheduleDraft.scriptId" size="small"><el-option v-for="script in scriptStore.scripts" :key="script.id" :label="script.name" :value="script.id" /></el-select></label>
            <label><span>{{ t('scripts.cronExpression') }}</span><el-input v-model="scheduleDraft.cron" size="small" placeholder="*/30 * * * *" /></label>
          </div>
          <div class="schedule-target-picker"><span>{{ t('scripts.executionTargets') }}</span><div><button v-for="server in sshStore.servers" :key="server.id" type="button" :class="{ active: scheduleTargets.has(server.id) }" @click="toggleScheduleTarget(server.id)">{{ server.name }}</button></div></div>
          <div class="schedule-card-foot"><span>{{ t('scripts.cronHint') }}</span><el-button type="primary" size="small" @click="createSchedule">{{ t('scripts.createSchedule') }}</el-button></div>
        </div>

        <div class="schedule-list">
          <div v-for="schedule in scriptStore.schedules" :key="schedule.id" class="schedule-item" :class="{ disabled: !schedule.enabled }">
            <div class="schedule-icon"><el-icon :size="17"><Timer /></el-icon></div>
            <div class="schedule-copy"><b>{{ scriptName(schedule.scriptId) }}</b><span><code>{{ schedule.cron }}</code> · {{ t('scripts.targetsCount', { n: schedule.targetIds.length }) }}</span><small>{{ schedule.nextRunAt ? t('scripts.nextRun', { time: formatDate(schedule.nextRunAt) }) : t('scripts.disabled') }}</small></div>
            <el-switch :model-value="schedule.enabled" size="small" @change="(value: boolean) => scriptStore.setScheduleEnabled(schedule.id, value)" />
            <el-button size="small" text :disabled="!schedule.enabled" @click="runScheduleNow(schedule.id)"><el-icon :size="13"><VideoPlay /></el-icon></el-button>
            <el-button size="small" text class="schedule-delete" @click="removeSchedule(schedule.id)"><el-icon :size="13"><Delete /></el-icon></el-button>
          </div>
          <OpsEmptyState v-if="!scriptStore.schedules.length" :icon="Timer" :title="t('scripts.emptySchedules')" :description="t('scripts.schedulerHint')" />
        </div>
      </section>

      <section v-else class="script-history-view">
        <div class="history-summary"><span>{{ t('scripts.historyTitle') }}</span><small>{{ t('scripts.historyHint') }}</small></div>
        <div class="script-log-list">
          <article v-for="log in scriptStore.runLogs" :key="log.id" class="script-log" :class="log.status">
            <div class="script-log-head">
              <span class="script-log-status"></span><b>{{ log.scriptName }}</b><span class="script-log-server">{{ log.serverName }}</span><span class="script-log-badge">{{ statusLabel(log.status) }}</span><span class="script-log-time">{{ formatDate(log.startedAt) }}</span>
              <button type="button" @click="toggleLog(log.id)"><el-icon :size="13"><ArrowUp v-if="expandedLogs.has(log.id)" /><ArrowDown v-else /></el-icon></button>
            </div>
            <pre v-if="expandedLogs.has(log.id)">{{ log.output || t('scripts.noOutput') }}</pre>
            <p v-else>{{ outputPreview(log.output) }}</p>
          </article>
          <OpsEmptyState v-if="!scriptStore.runLogs.length" :icon="Document" :title="t('scripts.emptyHistory')" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref } from 'vue'
import { ArrowDown, ArrowUp, ChatDotRound, Delete, Document, FullScreen, Lock, MagicStick, Plus, Timer, VideoPlay } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useLocale } from '@/composables/useLocale'
import { useSshStore } from '@/stores/ssh'
import { useScriptAutomationStore, type ScriptRunStatus } from '@/stores/scriptAutomation'
import { classifyCommand } from '@/utils/ops-permission'
import { isValidCron } from '@/utils/script-cron'
import OpsEmptyState from '@/components/OpsEmptyState.vue'

type Tab = 'editor' | 'schedules' | 'history'
type ScriptDraft = { id?: string; name: string; description: string; content: string; tags: string }
type SendScriptToAi = (name: string, content: string, prompt: string) => boolean | Promise<boolean>

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
const draft = reactive<ScriptDraft>({ id: undefined, name: '', description: '', content: '', tags: '' })
const focusEditorOpen = ref(false)
const focusEditorRef = ref<HTMLTextAreaElement>()
const editorViewRef = ref<HTMLElement>()
const targetPanelWidth = ref(260)
const scriptPageRef = ref<HTMLElement>()
const libraryWidth = ref(258)

const currentRisk = computed(() => classifyCommand(draft.content).risk)
const canRun = computed(() => Boolean(draft.id && draft.content.trim() && selectedTargets.size && currentRisk.value === 'read_only'))

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
function toggleTarget(id: string) { selectedTargets.has(id) ? selectedTargets.delete(id) : selectedTargets.add(id) }
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

function openFocusEditor() {
  focusEditorOpen.value = true
  nextTick(() => focusEditorRef.value?.focus())
}

function saveAndCloseFocusEditor() {
  saveScript()
  if (draft.id) focusEditorOpen.value = false
}

function resetTargetPanelWidth() { targetPanelWidth.value = 260 }
function onTargetResizeStart(event: PointerEvent) {
  const editorWidth = editorViewRef.value?.clientWidth || 0
  if (editorWidth < 500 || window.matchMedia('(max-width: 820px)').matches) return
  const startX = event.clientX
  const startWidth = targetPanelWidth.value
  const maxWidth = Math.max(210, editorWidth - 270)
  const onMove = (moveEvent: PointerEvent) => {
    targetPanelWidth.value = Math.min(maxWidth, Math.max(210, startWidth - (moveEvent.clientX - startX)))
  }
  const onEnd = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onEnd)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onEnd, { once: true })
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

async function runNow() {
  if (!draft.id) { saveScript(); if (!draft.id) return }
  if (currentRisk.value !== 'read_only') { ElMessage.warning(t('scripts.changeBlocked')); return }
  if (!selectedTargets.size) { ElMessage.warning(t('scripts.targetRequired')); return }
  try {
    await scriptStore.executeScript(draft.id, [...selectedTargets])
    activeTab.value = 'history'
  } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}

async function askAi(mode: 'draft' | 'review') {
  const name = draft.name.trim() || t('scripts.untitled')
  const prompt = mode === 'draft'
    ? t('scripts.aiDraftPrompt')
    : t('scripts.aiReviewPrompt')
  if (!sendScriptToAI) { ElMessage.warning(t('scripts.aiUnavailable')); return }
  if (await sendScriptToAI(name, draft.content, prompt)) ElMessage.success(t('scripts.aiSent'))
}

function createSchedule() {
  const script = scriptStore.scripts.find(item => item.id === scheduleDraft.scriptId)
  if (!script) { ElMessage.warning(t('scripts.scheduleScriptRequired')); return }
  if (classifyCommand(script.content).risk !== 'read_only') { ElMessage.warning(t('scripts.scheduleReadonlyOnly')); return }
  if (!scheduleTargets.size) { ElMessage.warning(t('scripts.targetRequired')); return }
  if (!isValidCron(scheduleDraft.cron)) { ElMessage.warning(t('scripts.invalidCron')); return }
  scriptStore.saveSchedule({ scriptId: script.id, targetIds: [...scheduleTargets], cron: scheduleDraft.cron, enabled: true })
  ElMessage.success(t('scripts.scheduleCreated'))
}

async function runScheduleNow(scheduleId: string) {
  const schedule = scriptStore.schedules.find(item => item.id === scheduleId)
  if (!schedule) return
  try { await scriptStore.executeScript(schedule.scriptId, schedule.targetIds, schedule.id); activeTab.value = 'history' } catch (error) { ElMessage.error(error instanceof Error ? error.message : String(error)) }
}

async function removeSchedule(scheduleId: string) {
  try { await ElMessageBox.confirm(t('scripts.removeScheduleConfirm'), t('common.confirm'), { type: 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') }); scriptStore.removeSchedule(scheduleId) } catch {}
}

function toggleLog(logId: string) { expandedLogs.has(logId) ? expandedLogs.delete(logId) : expandedLogs.add(logId) }
function outputPreview(value: string) { return value.replace(/\s+/g, ' ').trim().slice(0, 160) || t('scripts.noOutput') }
function formatDate(value: number) { return new Date(value).toLocaleString(locale.value === 'zh-CN' ? 'zh-CN' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) }
function statusLabel(status: ScriptRunStatus) { return t(`scripts.status_${status}`) }

onMounted(() => {
  if (!sshStore.servers.length) sshStore.init()
  scriptStore.init()
  const first = scriptStore.scripts[0]
  if (first) selectScript(first.id)
})
</script>

<style lang="scss" scoped>
.script-page { display: flex; height: 100%; min-height: 0; overflow: hidden; background: $shell-workspace-bg; }
.script-library { width: var(--script-library-width, 258px); flex-shrink: 0; display: flex; flex-direction: column; min-height: 0; border-right: 1px solid $color-border-light; background: $color-bg-surface; }
.script-library-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 16px 14px 10px;
  h2 { margin: 3px 0 0; color: $color-text-primary; font-size: 17px; line-height: 1.2; }
}
.script-eyebrow { color: $color-primary; font-size: 9px; font-weight: 750; letter-spacing: 1.25px; }
.script-library-meta { display: flex; justify-content: space-between; padding: 0 14px 10px; color: $color-text-placeholder; font-size: 10px; border-bottom: 1px solid $color-border-light;
  span { display: inline-flex; align-items: center; gap: 4px; } i { width: 6px; height: 6px; border-radius: 50%; background: $color-success; }
}
.script-list { flex: 1; overflow-y: auto; padding: 8px; }
.script-list-item { width: 100%; display: flex; align-items: center; gap: 8px; padding: 9px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; text-align: left; color: $color-text-secondary; cursor: pointer; font: inherit;
  &:hover { background: $color-bg-hover; color: $color-text-primary; } &.active { background: $color-bg-active; border-color: $color-border-light; color: $color-text-primary; }
}
.script-file-icon { width: 29px; height: 29px; display: inline-flex; align-items: center; justify-content: center; border-radius: 7px; color: $color-primary; background: $color-bg-active; flex-shrink: 0; }
.script-list-copy { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; b { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; } small { overflow: hidden; color: $color-text-placeholder; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; } }
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
.script-form-head { display: flex; flex-direction: column; gap: 12px; align-items: stretch; margin-bottom: 12px; }.script-form-fields { display: grid; gap: 7px; min-width: 0; }.script-form-actions { display: flex; width: 100%; max-width: 100%; gap: 6px; flex-wrap: wrap; justify-content: flex-start; }.script-form-actions :deep(.el-button) { margin: 0; }
.script-name-input :deep(.el-input__inner) { font-size: 16px; font-weight: 700; color: $color-text-primary; }.script-description-input :deep(.el-input__inner) { color: $color-text-secondary; }
.script-editor-label { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; color: $color-text-secondary; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .5px; }.script-language { color: $color-primary; font-family: $font-family-mono; }
.script-editor { flex: 1; min-height: 250px; resize: none; padding: 13px; border: 1px solid $color-border; border-radius: 9px; outline: none; background: $color-bg-input; color: $color-text-primary; font: 12px/1.65 $font-family-mono; tab-size: 2; &:focus { border-color: $color-primary; box-shadow: 0 0 0 2px $color-bg-active; } }
.script-form-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding-top: 10px; }.script-tags-input { flex: 1 1 180px; min-width: 0; max-width: 320px; }.script-updated { flex: 1 1 130px; color: $color-text-placeholder; font-size: 10px; }
.script-focus-button { font-weight: 700; letter-spacing: .1px; box-shadow: 0 3px 10px $color-bg-active; }
.script-editor-resize { position: relative; display: flex; align-items: center; justify-content: center; cursor: col-resize; touch-action: none; background: $color-bg-surface; &:hover, &:active { background: $color-bg-active; } span { width: 2px; height: 34px; border-radius: 99px; background: $color-border; transition: height .16s ease, background .16s ease; } &:hover span, &:active span { height: 52px; background: $color-primary; } }
.script-execution-panel { display: flex; flex-direction: column; min-width: 0; min-height: 0; padding: 16px 13px; border-left: 1px solid $color-border-light; background: $color-bg-surface; }.script-panel-title { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; color: $color-text-primary; font-size: 12px; font-weight: 650; small { color: $color-text-placeholder; font-size: 10px; font-weight: 400; } }.script-target-list { flex: 1; min-height: 100px; overflow-y: auto; margin: 9px 0; }.script-target { display: flex; align-items: center; gap: 7px; padding: 7px; border-radius: 7px; cursor: pointer; &:hover, &.selected { background: $color-bg-hover; } input { accent-color: $color-primary; } i { width: 6px; height: 6px; border-radius: 50%; background: $color-text-muted; &.connected { background: $color-success; } } span { min-width: 0; display: flex; flex-direction: column; b, small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } b { color: $color-text-primary; font-size: 11px; } small { color: $color-text-placeholder; font: 9px $font-family-mono; } } }.script-target-empty { color: $color-text-placeholder; font-size: 11px; text-align: center; }
.script-risk-card { margin-top: auto; padding: 9px; border: 1px solid $color-border-light; border-radius: 8px; background: $color-bg-hover; color: $color-success; div { display: flex; align-items: center; gap: 5px; font-size: 11px; } p { margin: 5px 0 0; color: $color-text-secondary; font-size: 10px; line-height: 1.45; } &.change, &.unknown { color: $color-warning; } &.high_risk { color: $color-danger; } }.script-run-btn { width: 100%; margin-top: 9px; }.script-scheduler-note { margin: 8px 0 0; color: $color-text-placeholder; font-size: 9px; line-height: 1.45; }

.script-schedules-view, .script-history-view { flex: 1; overflow-y: auto; padding: 16px; }.schedule-create-card, .schedule-item, .history-summary, .script-log { border: 1px solid $glass-border; border-radius: 9px; background: $glass-bg; box-shadow: $elevation-1; }.schedule-create-card { padding: 14px; }.schedule-card-head { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; h3 { margin: 3px 0 0; font-size: 15px; color: $color-text-primary; } }.schedule-readonly { padding: 3px 6px; border-radius: 5px; color: $color-success; background: $color-bg-success-hover; font-size: 10px; }.schedule-form-grid { display: grid; grid-template-columns: minmax(170px, 1fr) minmax(150px, 1fr); gap: 10px; margin-top: 14px; label { display: grid; gap: 5px; color: $color-text-secondary; font-size: 10px; } }.schedule-target-picker { display: grid; gap: 6px; margin-top: 12px; color: $color-text-secondary; font-size: 10px; div { display: flex; flex-wrap: wrap; gap: 5px; } button { border: 1px solid $color-border-light; border-radius: 999px; padding: 3px 8px; background: $color-bg-input; color: $color-text-secondary; cursor: pointer; font: inherit; font-size: 10px; &.active { color: $color-primary; border-color: $color-primary; background: $color-bg-active; } } }.schedule-card-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 13px; color: $color-text-placeholder; font-size: 10px; }.schedule-list { display: grid; gap: 8px; margin-top: 14px; }.schedule-item { display: flex; align-items: center; gap: 10px; padding: 10px 12px; &.disabled { opacity: .62; } }.schedule-icon { width: 31px; height: 31px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; color: $color-primary; background: $color-bg-active; }.schedule-copy { min-width: 0; flex: 1; display: grid; gap: 2px; b { color: $color-text-primary; font-size: 12px; } span, small { color: $color-text-secondary; font-size: 10px; } small { color: $color-text-placeholder; } code { padding: 1px 4px; border-radius: 3px; color: $color-primary; background: $color-bg-active; font-family: $font-family-mono; } }.schedule-delete { color: $color-danger !important; }
.history-summary { display: flex; justify-content: space-between; gap: 8px; padding: 11px 13px; color: $color-text-primary; font-size: 13px; font-weight: 650; small { color: $color-text-placeholder; font-size: 10px; font-weight: 400; } }.script-log-list { display: grid; gap: 7px; margin-top: 12px; }.script-log { overflow: hidden; &.success { border-left: 3px solid $color-success; } &.failed { border-left: 3px solid $color-danger; } &.skipped { border-left: 3px solid $color-text-muted; } }.script-log-head { display: flex; align-items: center; gap: 7px; padding: 9px 11px; b { color: $color-text-primary; font-size: 12px; }.script-log-server { color: $color-text-secondary; font-size: 10px; }.script-log-badge { padding: 1px 5px; border-radius: 4px; color: $color-text-secondary; background: $color-bg-hover; font-size: 9px; }.script-log-time { margin-left: auto; color: $color-text-placeholder; font: 9px $font-family-mono; }.script-log-status { width: 7px; height: 7px; border-radius: 50%; background: $color-warning; }.success .script-log-status { background: $color-success; }.failed .script-log-status { background: $color-danger; } button { border: 0; background: transparent; color: $color-text-secondary; cursor: pointer; } }.script-log p, .script-log pre { margin: 0; padding: 8px 11px; border-top: 1px solid $color-border-light; color: $color-text-secondary; font: 10px/1.5 $font-family-mono; }.script-log p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.script-log pre { max-height: 300px; overflow: auto; white-space: pre-wrap; word-break: break-word; color: $color-text-regular; }

@media (max-width: 1040px) { .script-editor-view { grid-template-columns: minmax(0, 1fr) 9px 230px; }.script-form-head { flex-direction: column; }.script-form-actions { justify-content: flex-start; } }
@media (max-width: 820px) { .script-page { flex-direction: column; }.script-library { width: auto; max-height: 190px; border-right: 0; border-bottom: 1px solid $color-border-light; }.script-library-resize { display: none; }.script-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }.script-editor-view { grid-template-columns: 1fr; overflow-y: auto; }.script-editor-resize { display: none; }.script-editor-main { min-height: 430px; }.script-execution-panel { border-left: 0; border-top: 1px solid $color-border-light; min-height: 280px; }.script-target-list { max-height: 130px; }.script-workspace { overflow: hidden; } }
@media (max-width: 560px) { .script-page-head, .history-summary, .schedule-card-foot { align-items: flex-start; flex-direction: column; }.script-head-status { align-self: flex-end; }.script-tabs { width: 100%; overflow-x: auto; }.schedule-form-grid { grid-template-columns: 1fr; }.schedule-item { flex-wrap: wrap; }.schedule-copy { min-width: calc(100% - 44px); }.script-log-head { flex-wrap: wrap; }.script-log-time { margin-left: 0; }.script-editor-main, .script-schedules-view, .script-history-view { padding: 11px; } }
@container script-workspace (max-width: 480px) { .script-form-head { flex-direction: column; }.script-form-fields { width: 100%; flex-basis: auto; }.script-form-actions { width: 100%; margin-left: 0; justify-content: flex-start; }.script-editor-view { grid-template-columns: 1fr; overflow-y: auto; }.script-editor-resize { display: none; }.script-editor-main { min-height: 430px; }.script-execution-panel { border-left: 0; border-top: 1px solid $color-border-light; min-height: 280px; }.script-target-list { max-height: 130px; } }
@container script-editor (max-width: 420px) { .script-form-actions { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }.script-form-actions :deep(.el-button) { width: 100%; min-width: 0; padding-inline: 6px; font-size: 10px; }.script-form-actions .script-focus-button { grid-column: 1 / -1; padding-inline: 10px; font-size: 11px; } }
:deep(.script-focus-dialog) { --el-dialog-bg-color: #{$color-bg-surface}; border: 1px solid $color-border; border-radius: 12px; box-shadow: $elevation-3; .el-dialog__header { margin-right: 0; padding: 18px 20px 13px; border-bottom: 1px solid $color-border-light; }.el-dialog__title { color: $color-text-primary; font-size: 16px; font-weight: 700; }.el-dialog__body { padding: 16px 20px; }.el-dialog__footer { padding: 12px 20px 16px; border-top: 1px solid $color-border-light; } }
.focus-editor-hint { margin: 0 0 13px; color: $color-text-secondary; font-size: 12px; }.focus-editor-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr); gap: 10px; }.focus-editor-label { display: flex; justify-content: space-between; margin: 15px 0 6px; color: $color-text-secondary; font-size: 11px; font-weight: 650; span:last-child { color: $color-primary; font-family: $font-family-mono; } }.focus-script-editor { display: block; box-sizing: border-box; width: 100%; height: min(58vh, 620px); min-height: 360px; resize: vertical; padding: 15px; border: 1px solid $color-border; border-radius: 9px; outline: none; background: $color-bg-input; color: $color-text-primary; font: 13px/1.7 $font-family-mono; &:focus { border-color: $color-primary; box-shadow: 0 0 0 2px $color-bg-active; } }
@media (max-width: 640px) { .focus-editor-fields { grid-template-columns: 1fr; }.focus-script-editor { min-height: 280px; } }
</style>
