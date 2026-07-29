<template>
  <el-button class="ops-permission-control permission-button" size="small" text :title="currentLabel" @click="visible = true">
    <el-icon :size="14"><Lock /></el-icon>
    <span class="permission-label">{{ currentLabel }}</span>
  </el-button>

  <el-dialog v-model="visible" class="permission-dialog" :title="t('ai.permissionTitle')" width="420px" append-to-body>
    <p class="permission-intro">{{ t('ai.permissionHint') }}</p>
    <el-radio-group :model-value="level" class="permission-levels" @update:model-value="selectLevel">
      <el-radio-button v-for="item in levels" :key="item.value" :label="item.value">
        <span class="level-name">{{ item.label }}</span>
        <span class="level-desc">{{ item.description }}</span>
      </el-radio-button>
    </el-radio-group>
    <template #footer>
      <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="visible = false">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Lock } from '@element-plus/icons-vue'
import { useLocale } from '@/composables/useLocale'
import type { PermissionLevel } from '@/utils/ops-permission'

const props = defineProps<{ level: PermissionLevel }>()
const emit = defineEmits<{ 'update:level': [level: PermissionLevel] }>()
const { t } = useLocale()
const visible = ref(false)

const levels = computed(() => [
  { value: 'readonly' as const, label: t('ai.permissionReadonly'), description: t('ai.permissionReadonlyDesc') },
  { value: 'controlled' as const, label: t('ai.permissionControlled'), description: t('ai.permissionControlledDesc') },
  { value: 'elevated' as const, label: t('ai.permissionElevated'), description: t('ai.permissionElevatedDesc') },
  { value: 'custom' as const, label: t('ai.permissionCustom'), description: t('ai.permissionCustomDesc') },
])
const currentLabel = computed(() => levels.value.find(item => item.value === props.level)?.label || t('ai.permissionControlled'))

function selectLevel(level: string | number | boolean | undefined) {
  if (level === 'readonly' || level === 'controlled' || level === 'elevated' || level === 'custom') emit('update:level', level)
}
</script>

<style lang="scss">
.ops-permission-control.permission-button { color: $color-text-regular; gap: 4px; &:hover { color: $color-primary; } }
.permission-dialog .permission-intro { margin: 0 0 14px; color: $color-text-secondary; font-size: $font-size-sm; line-height: 1.55; }
.permission-dialog .permission-levels { display: grid; grid-template-columns: 1fr; gap: 8px; width: 100%; }
.permission-dialog .permission-levels .el-radio-button { width: 100%; }
.permission-dialog .permission-levels .el-radio-button__inner {
  width: 100%; height: auto; padding: 11px 13px; text-align: left; white-space: normal;
  color: $color-text-primary !important; background: $surface-contrast-soft !important;
  border: 1px solid $color-border !important; border-radius: $border-radius-md !important;
  box-shadow: none !important; transition: background $transition-fast, border-color $transition-fast, color $transition-fast;
}
.permission-dialog .permission-levels .el-radio-button:hover .el-radio-button__inner {
  background: $color-bg-hover !important; border-color: $color-border-focus !important;
}
.permission-dialog .permission-levels .el-radio-button__original-radio:checked + .el-radio-button__inner {
  color: $color-text-primary !important; background: $color-bg-active !important;
  border-color: $color-primary !important; box-shadow: inset 3px 0 0 $color-primary !important;
}
.permission-dialog .level-name { display: block; font-weight: 650; }
.permission-dialog .level-desc { display: block; margin-top: 3px; color: $color-text-secondary; font-size: $font-size-xs; }
</style>
