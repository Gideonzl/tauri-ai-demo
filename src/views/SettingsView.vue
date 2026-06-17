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
    </div>

    <!-- 右键菜单 -->
    <div v-if="ctx.visible" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
      <div class="ctx-item" @click="ctxAct('refresh')"><el-icon :size="13"><Refresh /></el-icon><span>{{ t('common.refresh') }}</span></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { Refresh, Plus, Close, ArrowRight, Edit } from '@element-plus/icons-vue'
import { useConfigStore } from '@/stores/config'
import { useHighlightRulesStore, hexToAnsi, ansiToHex } from '@/stores/highlightRules'
import { useLocale } from '@/composables/useLocale'
import { useContextMenu } from '@/composables/useContextMenu'

const configStore = useConfigStore()
const hlStore = useHighlightRulesStore()
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
  'termius-dark': { keyword: '#c792ea', string: '#c3e88d', number: '#f78c6c', key: '#89ddff' },
  'xterminal': { keyword: '#bb9af7', string: '#9ece6a', number: '#ff9e64', key: '#7dcfff' },
  'monokai': { keyword: '#f92672', string: '#e6db74', number: '#ae81ff', key: '#66d9ef' },
  'one-dark': { keyword: '#c678dd', string: '#98c379', number: '#d19a66', key: '#61afef' },
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
.theme-card { display: flex; flex-direction: column; align-items: center; gap: $spacing-xs; padding: $spacing-md; border: 1px solid $color-border; border-radius: $border-radius-md; cursor: pointer; background: $color-bg-surface; transition: all $transition-fast; min-width: 100px;
  &:hover { border-color: $color-primary; }
  &.active { border-color: $color-primary; background-color: $color-bg-active; }
}
.theme-preview { display: flex; gap: 4px; }
.tp-dot { width: 12px; height: 12px; border-radius: 50%; }
.theme-name { font-size: $font-size-xs; color: $color-text-regular; text-transform: capitalize; }

.color-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: $spacing-sm; }
.color-item { display: flex; flex-direction: column; gap: 2px; }
.color-label { font-size: $font-size-xs; color: $color-text-regular; text-transform: capitalize; font-family: $font-family-mono; }
.color-input-row { display: flex; gap: $spacing-xs; align-items: center; }
.color-picker { width: 30px; height: 26px; border: none; border-radius: $border-radius-sm; cursor: pointer; background: transparent; &::-webkit-color-swatch-wrapper { padding: 0; } &::-webkit-color-swatch { border: 1px solid $color-border; border-radius: 2px; } }
.color-text { flex: 1; background: $color-bg-input; border: 1px solid $color-border; border-radius: $border-radius-sm; color: $color-text-primary; font-family: $font-family-mono; font-size: $font-size-xs; padding: 2px 6px; outline: none; &:focus { border-color: $color-primary; } }

.lang-grid { display: flex; gap: $spacing-md; flex-wrap: wrap; }
.lang-card { display: flex; flex-direction: column; align-items: center; gap: $spacing-xs; padding: $spacing-md; border: 1px solid $color-border; border-radius: $border-radius-md; cursor: pointer; background: $color-bg-surface; transition: all $transition-fast; min-width: 80px;
  &:hover { border-color: $color-primary; }
  &.active { border-color: $color-primary; background-color: $color-bg-active; }
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
</style>
