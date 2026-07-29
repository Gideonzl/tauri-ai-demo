<template>
  <el-button class="permission-button" size="small" text @click="visible = true">
    <el-icon :size="14"><Lock /></el-icon>
    <span>{{ currentLabel }}</span>
  </el-button>

  <el-dialog v-model="visible" :title="t('ai.permissionTitle')" width="420px" append-to-body>
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

<style scoped lang="scss">
.permission-button { color: $color-text-secondary; gap: 4px; &:hover { color: $color-primary; } }
.permission-intro { margin: 0 0 14px; color: $color-text-secondary; font-size: $font-size-sm; line-height: 1.55; }
.permission-levels { display: grid; grid-template-columns: 1fr; gap: 8px; width: 100%; }
.permission-levels :deep(.el-radio-button) { width: 100%; }
.permission-levels :deep(.el-radio-button__inner) { width: 100%; height: auto; padding: 10px 12px; text-align: left; white-space: normal; border-left: 1px solid var(--el-border-color) !important; border-radius: 5px !important; box-shadow: none !important; }
.level-name { display: block; font-weight: 600; }
.level-desc { display: block; margin-top: 3px; color: $color-text-secondary; font-size: $font-size-xs; }
</style>
