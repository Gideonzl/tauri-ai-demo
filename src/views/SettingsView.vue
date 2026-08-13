/**
 * 设置页面 — 预留占位
 * Termius极简风格
 */
<template>
  <div class="settings-view" @contextmenu.prevent="onSettingsCtx">
    <div class="settings-header">
      <span class="title">{{ t('settings.title') }}</span>
    </div>
    <div class="settings-body">
      <!-- Color Theme -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'theme' ? '' : 'theme'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'theme' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.colorTheme') }}</span>
        </div>
        <div v-if="activeSection === 'theme'" class="section-body">
          <div class="theme-grid">
            <div v-for="(t, key) in themes" :key="key" class="theme-card" :class="{ active: configStore.colorScheme === key }" @click="configStore.setScheme(key)">
              <div class="theme-preview">
                <span class="tp-dot" :style="{ background: t.keyword }"></span>
                <span class="tp-dot" :style="{ background: t.string }"></span>
                <span class="tp-dot" :style="{ background: t.number }"></span>
                <span class="tp-dot" :style="{ background: t.key }"></span>
              </div>
              <span class="theme-name">{{ key }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Language -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'lang' ? '' : 'lang'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'lang' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.language') }}</span>
        </div>
        <div v-if="activeSection === 'lang'" class="section-body">
          <div class="lang-grid">
            <div v-for="loc in locales" :key="loc.value" class="lang-card" :class="{ active: locale === loc.value }" @click="setLocale(loc.value)">
              <span class="lang-flag">{{ loc.value === 'zh-CN' ? '中' : 'A' }}</span>
              <span class="lang-name">{{ loc.label }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Custom Colors -->
      <div class="setting-section" v-if="configStore.colorScheme === 'custom'">
        <div class="section-header" @click="activeSection = activeSection === 'customColor' ? '' : 'customColor'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'customColor' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.customColors') || 'Custom Colors' }}</span>
        </div>
        <div v-if="activeSection === 'customColor'" class="section-body">
          <div class="color-grid">
            <div v-for="(val, key) in configStore.customColors" :key="key" class="color-item">
              <span class="color-label">{{ key }}</span>
              <div class="color-input-row">
                <input type="color" :value="val" @input="(e) => configStore.updateCustomColor(key, e.target.value)" class="color-picker" />
                <input type="text" :value="val" @change="(e) => configStore.updateCustomColor(key, e.target.value)" class="color-text" />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Terminal Highlight Rules -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'highlight' ? '' : 'highlight'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'highlight' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.terminalHighlight') || 'Terminal Highlighting' }}</span>
        </div>
        <div v-if="activeSection === 'highlight'" class="section-body">
          <div class="highlight-actions">
            <el-button size="small" @click="hlStore.enableAll()">{{ t('settings.enableAll') || 'Enable All' }}</el-button>
            <el-button size="small" @click="hlStore.disableAll()">{{ t('settings.disableAll') || 'Disable All' }}</el-button>
            <el-button size="small" @click="hlStore.resetToDefaults()" type="warning" text>{{ t('settings.reset') || 'Reset' }}</el-button>
            <el-button size="small" type="primary" @click="showAddRule = !showAddRule">
              <el-icon :size="12"><Plus /></el-icon> {{ t('settings.addRule') || 'Add Rule' }}
            </el-button>
          </div>

          <!-- Add custom rule form -->
          <div v-if="showAddRule" class="add-rule-form">
            <el-input v-model="newRule.name" size="small" :placeholder="t('settings.ruleName') || 'Rule name'" class="rule-field" />
            <el-input v-model="newRule.pattern" size="small" :placeholder="t('settings.rulePattern') || 'Regex'" class="rule-field" />
            <div class="color-picker-row">
              <input type="color" v-model="newRule.color" class="native-color-picker" />
              <el-input v-model="newRule.color" size="small" placeholder="#FFA500" class="rule-field rule-hex" />
              <span class="color-presets">
                <span v-for="cp in hlStore.COLOR_PRESETS" :key="cp" class="color-preset-dot"
                  :style="{ background: cp }" @click="newRule.color = cp" :title="cp"></span>
              </span>
            </div>
            <el-button size="small" type="primary" @click="savingRule" :disabled="!newRule.name || !newRule.pattern || !newRule.color">{{ editingRuleId ? (t('settings.update') || 'Update') : (t('settings.save') || 'Save') }}</el-button>
            <el-button v-if="editingRuleId" size="small" @click="cancelEdit">{{ t('settings.cancel') || 'Cancel' }}</el-button>
          </div>

          <!-- Rules list -->
          <div class="hl-rules-list">
            <div v-for="rule in hlStore.rules" :key="rule.id" class="hl-rule-row" :class="{ disabled: !rule.enabled }">
              <el-switch v-model="rule.enabled" size="small" @update:model-value="hlStore.saveRules()" />
              <span class="hl-rule-swatch" :style="{ color: ansiToHex(rule.color) }">●</span>
              <span class="hl-rule-name">{{ rule.name }}</span>
              <span class="hl-rule-preview">{{ rule.description || rule.pattern.slice(0, 30) }}</span>
              <span class="hl-rule-tag" v-if="rule.isBuiltin">{{ t('settings.builtin') || 'built-in' }}</span>
              <el-button size="small" text @click="editRule(rule)">
                <el-icon :size="12"><Edit /></el-icon>
              </el-button>
              <el-button v-if="!rule.isBuiltin" size="small" text type="danger" @click="hlStore.deleteCustomRule(rule.id)">
                <el-icon :size="12"><Close /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- Terminal -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'terminal' ? '' : 'terminal'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'terminal' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.terminal') }}</span>
        </div>
        <div v-if="activeSection === 'terminal'" class="section-body">
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.fontSize') }}</span>
            <el-slider v-model="ts.settings.fontSize" :min="9" :max="22" size="small" class="opt-slider" @change="ts.set('fontSize', ts.settings.fontSize)" />
            <span class="opt-val">{{ ts.settings.fontSize }}px</span>
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.fontFamily') }}</span>
            <el-select :model-value="ts.settings.fontFamily" size="small" class="opt-select" @change="(v) => ts.set('fontFamily', v)">
              <el-option v-for="f in FONT_PRESETS" :key="f" :label="f.split(',')[0].replace(/'/g, '')" :value="f" />
            </el-select>
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.cursorStyle') }}</span>
            <div class="opt-btns">
              <button v-for="c in ['bar','block','underline']" :key="c" class="opt-btn" :class="{ active: ts.settings.cursorStyle === c }" @click="ts.set('cursorStyle', c)">
                {{ c === 'bar' ? t('settings.cursorBar') : c === 'block' ? t('settings.cursorBlock') : t('settings.cursorUnderline') }}
              </button>
            </div>
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.cursorBlink') }}</span>
            <el-switch :model-value="ts.settings.cursorBlink" size="small" @change="(v) => ts.set('cursorBlink', v)" />
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.scrollback') }}</span>
            <el-select :model-value="ts.settings.scrollback" size="small" class="opt-select" @change="(v) => ts.set('scrollback', v)">
              <el-option v-for="n in [1000, 5000, 10000, 50000]" :key="n" :label="String(n)" :value="n" />
            </el-select>
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.copyOnSelect') }}</span>
            <el-switch :model-value="ts.settings.copyOnSelect" size="small" @change="(v) => ts.set('copyOnSelect', v)" />
          </div>
          <div class="opt-row">
            <el-button size="small" text type="warning" @click="ts.reset()">{{ t('settings.resetTerminal') }}</el-button>
          </div>
        </div>
      </div>

      <!-- Behavior -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'behavior' ? '' : 'behavior'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'behavior' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.behavior') }}</span>
        </div>
        <div v-if="activeSection === 'behavior'" class="section-body">
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.confirmClose') }}</span>
            <el-switch :model-value="ts.settings.confirmClose" size="small" @change="(v) => ts.set('confirmClose', v)" />
          </div>
          <div class="opt-row">
            <span class="opt-label">{{ t('settings.showSplash') }}</span>
            <el-switch :model-value="ts.settings.showSplash" size="small" @change="(v) => ts.set('showSplash', v)" />
          </div>
        </div>
      </div>

      <!-- Data Management -->
      <div class="setting-section">
        <div class="section-header" @click="activeSection = activeSection === 'data' ? '' : 'data'">
          <el-icon :size="12" class="section-chevron" :class="{ open: activeSection === 'data' }"><ArrowRight /></el-icon>
          <span class="section-title">{{ t('settings.dataManage') }}</span>
        </div>
        <div v-if="activeSection === 'data'" class="section-body">
          <p class="data-hint">{{ t('settings.exportHint') }}</p>
          <div class="data-actions">
            <el-button size="small" type="primary" @click="exportData">
              <el-icon :size="13"><Download /></el-icon>{{ t('settings.exportData') }}
            </el-button>
            <el-button size="small" @click="triggerImport">
              <el-icon :size="13"><Upload /></el-icon>{{ t('settings.importData') }}
            </el-button>
            <el-button size="small" text @click="showSnapshots = !showSnapshots">
              {{ t('data.snapshots') }}<span v-if="snapshotsStore.snapshotCount"> · {{ snapshotsStore.snapshotCount }}</span>
            </el-button>
            <input ref="importInput" type="file" accept="application/json" style="display:none" @change="importData" />
          </div>
          <div v-if="showSnapshots" class="snapshot-list">
            <div v-if="snapshotsStore.snapshots.length === 0" class="snapshot-empty">{{ t('common.noData') }}</div>
            <div v-for="snapshot in snapshotsStore.snapshots" :key="snapshot.id" class="snapshot-row">
              <button class="snapshot-main" @click="sendSnapshotToAi(snapshot.id)">
                <span>{{ snapshot.title }}</span>
                <small>{{ formatSnapshotTime(snapshot.createdAt) }} · {{ snapshot.commands.length }}</small>
              </button>
              <div class="snapshot-actions">
                <el-button text size="small" @click="importSnapshotToTerminal(snapshot.id)">{{ t('data.importToTerminal') }}</el-button>
                <el-button text size="small" type="danger" @click="snapshotsStore.deleteSnapshot(snapshot.id)">{{ t('data.deleteSnapshot') }}</el-button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Refresh, Plus, Close, ArrowRight, Edit, Download, Upload } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useConfigStore } from '@/stores/config'
import { useHighlightRulesStore, hexToAnsi, ansiToHex } from '@/stores/highlightRules'
import { useTerminalSettingsStore, FONT_PRESETS } from '@/stores/terminalSettings'
import { useWorkflowSnapshotsStore } from '@/stores/workflowSnapshots'
import { useChatStore } from '@/stores/chat'
import { useSshStore } from '@/stores/ssh'
import { useLocale } from '@/composables/useLocale'
import { useContextMenu } from '@/composables/useContextMenu'

const configStore = useConfigStore()
const router = useRouter()
const hlStore = useHighlightRulesStore()
const ts = useTerminalSettingsStore()
const snapshotsStore = useWorkflowSnapshotsStore()
const chatStore = useChatStore()
const sshStore = useSshStore()
const { locale, setLocale, t, locales } = useLocale()
const { register, unregister } = useContextMenu()
const activeSection = ref('')
// 右键菜单
const ctx = reactive({ visible: false, x: 0, y: 0 })
function onSettingsCtx(e: MouseEvent) { ctx.x = e.clientX; ctx.y = e.clientY; ctx.visible = true }
function hideCtx() { ctx.visible = false }
function ctxAct(action: string) { hideCtx(); if (action === 'refresh') location.reload() }
onMounted(() => { register(hideCtx); document.addEventListener('click', hideCtx) })
onUnmounted(() => { unregister(hideCtx); document.removeEventListener('click', hideCtx) })

// ── Data export / import (backup) ──
const importInput = ref<HTMLInputElement | null>(null)
const showSnapshots = ref(false)
const BACKUP_KEYS = ['ssh-servers', 'ssh-groups', 'ssh-quick-commands', 'color-scheme', 'terminal-settings', 'ops-alert-rules', 'ai-model-configs', 'highlight-rules', 'command-history']

function formatSnapshotTime(timestamp: number) {
  return new Intl.DateTimeFormat(locale.value, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

async function importSnapshotToTerminal(snapshotId: string) {
  const snapshot = snapshotsStore.getSnapshot(snapshotId)
  if (!snapshot) return
  if (!sshStore.activeSession) {
    ElMessage.warning('请先打开一个终端会话')
    return
  }
  await router.push('/')
  await nextTick()
  sshStore.runInTerminal(snapshot.commands.map(command => command.command).join('\n'))
  ElMessage.success(t('data.importToTerminal'))
}

function sendSnapshotToAi(snapshotId: string) {
  const snapshot = snapshotsStore.getSnapshot(snapshotId)
  if (!snapshot) return
  const commands = snapshot.commands.map(command => `\`\`\`shell\n${command.command}\n\`\`\``).join('\n')
  const summary = snapshot.aiSummary ? `\n${snapshot.aiSummary}` : ''
  chatStore.addUserMessage('ops', `[${t('data.snapshots')}] ${snapshot.title}\n${commands}${summary}`)
  ElMessage.success(t('data.sendToAi'))
}

function exportData() {
  const payload: Record<string, any> = { __app: 'AITerminal', __version: 1, __ts: Date.now(), data: {} }
  for (const k of BACKUP_KEYS) {
    const v = localStorage.getItem(k)
    if (v != null) payload.data[k] = v
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `aiterminal-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
  ElMessage.success(t('settings.dataExported'))
}

function triggerImport() { importInput.value?.click() }

function importData(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result))
      if (!parsed || parsed.__app !== 'AITerminal' || !parsed.data) throw new Error('bad format')
      for (const [k, v] of Object.entries(parsed.data)) {
        if (typeof v === 'string') localStorage.setItem(k, v)
      }
      ElMessage.success(t('settings.dataImported'))
      setTimeout(() => location.reload(), 800)
    } catch {
      ElMessage.error(t('settings.importFailed'))
    }
  }
  reader.readAsText(file)
  ;(e.target as HTMLInputElement).value = ''
}

// New/edit rule state
const showAddRule = ref(false)
const editingRuleId = ref<string | null>(null)
const newRule = reactive({ name: '', pattern: '', color: '\x1b[1;33m' })

function editRule(rule: any) {
  editingRuleId.value = rule.id
  newRule.name = rule.name
  newRule.pattern = rule.pattern
  newRule.color = ansiToHex(rule.color)  // show as hex in color picker
  showAddRule.value = true
}

function cancelEdit() {
  editingRuleId.value = null
  newRule.name = ''
  newRule.pattern = ''
  newRule.color = '\x1b[1;33m'
  showAddRule.value = false
}

function savingRule() {
  if (!newRule.name || !newRule.pattern || !newRule.color) return
  // Store as ANSI true color (handles both hex input and legacy ANSI codes)
  const ansiColor = hexToAnsi(newRule.color)
  if (editingRuleId.value) {
    hlStore.updateRule(editingRuleId.value, {
      name: newRule.name, pattern: newRule.pattern, color: ansiColor, colorLabel: newRule.color
    })
  } else {
    hlStore.addCustomRule(newRule.name, newRule.pattern, ansiColor, newRule.color)
  }
  cancelEdit()
}

const themes = {
  'neon-ops': { keyword: '#a855ff', string: '#42f58d', number: '#ffcc66', key: '#22f7ff' },
  'tech': { keyword: '#60a5fa', string: '#4ade80', number: '#fbbf24', key: '#38bdf8' },
  'termius-dark': { keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', key: '#89ddff' },
  'xterminal': { keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', key: '#7dcfff' },
  'monokai': { keyword: '#f92672', string: '#e6db74', number: '#ae81ff', key: '#66d9ef' },
  'one-dark': { keyword: '#c678dd', string: '#98c379', number: '#d19a66', key: '#61afef' },
  'dracula': { keyword: '#ff79c6', string: '#50fa7b', number: '#bd93f9', key: '#8be9fd' },
  'nord': { keyword: '#81a1c1', string: '#a3be8c', number: '#b48ead', key: '#88c0d0' },
  'high-contrast': { keyword: '#569cd6', string: '#ce9178', number: '#b5cea8', key: '#9cdcfe' },
  'catppuccin': { keyword: '#cba6f7', string: '#a6e3a1', number: '#fab387', key: '#89b4fa' },
  'gruvbox-dark': { keyword: '#d3869b', string: '#b8bb26', number: '#fe8019', key: '#8ec07c' },
    'one-light': { keyword: '#a626a4', string: '#50a14f', number: '#986801', key: '#4078f2' },
    'github-light': { keyword: '#cf222e', string: '#0a3069', number: '#0550ae', key: '#8250df' },
    'solarized-light': { keyword: '#cb4b16', string: '#859900', number: '#2aa198', key: '#268bd2' },
    'min-light': { keyword: '#8b00c9', string: '#007b00', number: '#b35c00', key: '#0066cc' },
}
</script>

<style lang="scss" scoped>
.settings-view { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.settings-header { height: $header-height; display: flex; align-items: center; padding: 0 $spacing-lg; border-bottom: 1px solid $color-border-light; background-color: $color-bg-toolbar; flex-shrink: 0;
  .title { font-size: $font-size-sm; font-weight: 600; color: $color-text-regular; text-transform: uppercase; letter-spacing: 0.5px; }
}
.settings-body { flex: 1; overflow-y: auto; padding: $spacing-lg; }
.settings-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: $spacing-xs; color: $color-text-secondary; p { font-size: $font-size-md; } .sub { font-size: $font-size-sm; color: $color-text-placeholder; } }

.setting-section { margin-bottom: $spacing-sm; }
.section-header { display: flex; align-items: center; gap: $spacing-sm; padding: $spacing-sm $spacing-md; cursor: pointer; border-radius: $border-radius-sm; transition: background $transition-fast; user-select: none;
  &:hover { background: $color-bg-hover; }
}
.section-chevron { color: $color-text-muted; transition: transform $transition-fast; flex-shrink: 0;
  &.open { transform: rotate(90deg); }
}
.section-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; text-transform: uppercase; letter-spacing: 0.3px; }
.section-body { padding: $spacing-md $spacing-lg; }

.theme-grid { display: flex; gap: $spacing-md; flex-wrap: wrap; }
.theme-card { display: flex; flex-direction: column; align-items: center; gap: $spacing-xs; padding: $spacing-md; border: 1px solid $color-border; border-radius: $border-radius-md; cursor: pointer; background: $color-bg-surface; transition: all $transition-normal; min-width: 100px;
  &:hover { border-color: $color-primary; transform: translateY(-3px); box-shadow: $elevation-2; }
  &.active { border-color: $color-primary; background-color: $color-bg-active; box-shadow: $glow-primary; }
}
.theme-preview { display: flex; gap: 4px; }
.tp-dot { width: 12px; height: 12px; border-radius: 50%; box-shadow: $elevation-1; transition: transform $transition-fast; }
.theme-card:hover .tp-dot { transform: scale(1.15); }
.theme-name { font-size: $font-size-xs; color: $color-text-regular; text-transform: capitalize; }

.color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: $spacing-sm; }
.color-item { display: flex; flex-direction: column; gap: 2px; }
.color-label { font-size: $font-size-xs; color: $color-text-regular; text-transform: capitalize; font-family: $font-family-mono; }
.color-input-row { display: flex; gap: $spacing-xs; align-items: center; }
.color-picker { width: 30px; height: 26px; border: none; border-radius: $border-radius-sm; cursor: pointer; background: transparent; &::-webkit-color-swatch-wrapper { padding: 0; } &::-webkit-color-swatch { border: 1px solid $color-border; border-radius: 2px; } }
.color-text { flex: 1; background: $color-bg-input; border: 1px solid $color-border; border-radius: $border-radius-sm; color: $color-text-primary; font-family: $font-family-mono; font-size: $font-size-xs; padding: 2px 6px; outline: none; &:focus { border-color: $color-primary; } }

.lang-grid { display: flex; gap: $spacing-md; flex-wrap: wrap; }
.lang-card { display: flex; flex-direction: column; align-items: center; gap: $spacing-xs; padding: $spacing-md; border: 1px solid $color-border; border-radius: $border-radius-md; cursor: pointer; background: $color-bg-surface; transition: all $transition-normal; min-width: 80px;
  &:hover { border-color: $color-primary; transform: translateY(-3px); box-shadow: $elevation-2; }
  &.active { border-color: $color-primary; background-color: $color-bg-active; box-shadow: $glow-primary; }
}
.lang-flag { font-size: 20px; font-weight: 700; color: $color-text-primary; }
.lang-name { font-size: $font-size-xs; color: $color-text-regular; }

// Terminal highlight rules
.highlight-actions { display: flex; gap: $spacing-xs; margin-bottom: $spacing-md; flex-wrap: wrap; }
.add-rule-form { display: flex; gap: $spacing-xs; margin-bottom: $spacing-md; flex-wrap: wrap; align-items: center; background: $color-bg-surface; padding: $spacing-sm; border-radius: $border-radius-md; border: 1px solid $color-border-light; }
.rule-field { width: 160px !important; }
.rule-hex { width: 110px !important; }
.color-picker-row { display: flex; align-items: center; gap: 4px; }
.native-color-picker { width: 30px; height: 30px; border: none; border-radius: 4px; cursor: pointer; background: transparent; padding: 0;
  &::-webkit-color-swatch-wrapper { padding: 0; }
  &::-webkit-color-swatch { border: 1px solid $color-border; border-radius: 3px; }
}
.color-presets { display: flex; gap: 3px; flex-wrap: wrap; }
.color-preset-dot { width: 18px; height: 18px; border-radius: 50%; cursor: pointer; border: 1px solid $color-border; transition: transform 0.1s;
  &:hover { transform: scale(1.3); border-color: $color-primary; }
}
.hl-rules-list { max-height: 360px; overflow-y: auto; }
.hl-rule-row { display: flex; align-items: center; gap: $spacing-sm; padding: 6px $spacing-sm; border-bottom: 1px solid $color-border-light; transition: background $transition-fast;
  &:hover { background: $color-bg-hover; }
  &.disabled { opacity: 0.4; }
}
.hl-rule-swatch { font-size: 14px; flex-shrink: 0; }
.hl-rule-name { font-size: $font-size-sm; font-weight: 500; color: $color-text-primary; min-width: 120px; flex-shrink: 0; }
.hl-rule-preview { font-size: 11px; color: $color-text-placeholder; font-family: $font-family-mono; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
.hl-rule-tag { font-size: 9px; padding: 0 4px; border-radius: 2px; color: $color-text-muted; background: $color-bg-input; letter-spacing: 0.3px; flex-shrink: 0; }

// ── Terminal / Behavior option rows ──
.opt-row { display: flex; align-items: center; gap: $spacing-md; padding: 7px 0; min-height: 32px; }
.opt-label { font-size: $font-size-sm; color: $color-text-regular; width: 130px; flex-shrink: 0; }
.opt-slider { flex: 1; max-width: 240px; }
.opt-val { font-size: $font-size-sm; font-family: $font-family-mono; color: $color-primary; width: 44px; }
.opt-select { width: 220px; }
.opt-btns { display: flex; background: $color-bg-input; border-radius: $border-radius-sm; padding: 2px; }
.opt-btn {
  padding: 4px 14px; border: none; background: transparent; cursor: pointer; font-family: inherit;
  font-size: $font-size-xs; color: $color-text-secondary; border-radius: $border-radius-sm - 1px; transition: all $transition-fast;
  &:hover { color: $color-text-primary; }
  &.active { background: $gradient-primary; color: $color-on-primary; }
}
.data-hint { font-size: $font-size-xs; color: $color-text-placeholder; margin-bottom: $spacing-sm; }
.data-actions { display: flex; gap: $spacing-sm; }
.snapshot-list { margin-top: $spacing-sm; border-top: 1px solid $color-border-light; }
.snapshot-empty { padding: $spacing-sm 0; font-size: $font-size-xs; color: $color-text-placeholder; }
.snapshot-row { display: flex; align-items: center; gap: $spacing-sm; min-height: 38px; border-bottom: 1px solid $color-border-light; }
.snapshot-main { min-width: 0; flex: 1; border: none; padding: 6px 0; text-align: left; color: $color-text-primary; background: transparent; cursor: pointer; }
.snapshot-main span, .snapshot-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snapshot-main span { font-size: $font-size-xs; }
.snapshot-main small { margin-top: 2px; color: $color-text-placeholder; font-size: 10px; }
.snapshot-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
</style>
