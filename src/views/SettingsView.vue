/**
 * 设置页面 — 预留占位
 * Termius极简风格
 */
<template>
  <div class="settings-view">
    <div class="settings-header">
      <span class="title">Settings</span>
    </div>
    <div class="settings-body">
      <!-- Color Theme -->
      <div class="setting-section">
        <div class="section-title">Color Theme</div>
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

      <!-- Custom Colors (only show when custom scheme selected) -->
      <div v-if="configStore.colorScheme === 'custom'" class="setting-section">
        <div class="section-title">Custom Colors</div>
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
  </div>
</template>

<script setup lang="ts">
import { useConfigStore } from '@/stores/config'
const configStore = useConfigStore()
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

.setting-section { margin-bottom: $spacing-xl; }
.section-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; margin-bottom: $spacing-md; text-transform: uppercase; letter-spacing: 0.3px; }

.theme-grid { display: flex; gap: $spacing-md; flex-wrap: wrap; }
.theme-card { display: flex; flex-direction: column; align-items: center; gap: $spacing-xs; padding: $spacing-md; border: 1px solid $color-border; border-radius: $border-radius-md; cursor: pointer; background: $color-bg-surface; transition: all $transition-fast; min-width: 100px;
  &:hover { border-color: $color-primary; }
  &.active { border-color: $color-primary; background-color: rgba($color-primary, 0.1); }
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
</style>
