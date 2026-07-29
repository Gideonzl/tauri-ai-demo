<template>
  <el-drawer :model-value="modelValue" :title="t('ai.auditTitle')" direction="rtl" size="390px" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <template #header>
      <div class="audit-header"><span>{{ t('ai.auditTitle') }}</span><el-button text size="small" @click="emit('clear')">{{ t('ops.clearAlerts') }}</el-button></div>
    </template>
    <div v-if="events.length === 0" class="audit-empty">{{ t('ai.auditEmpty') }}</div>
    <div v-for="event in events" :key="event.id" class="audit-event">
      <div class="audit-event-top"><strong>{{ event.hostName || t('ai.auditUnknownHost') }}</strong><el-tag size="small" :type="riskTag(event.decision.risk)">{{ riskLabel(event.decision.risk) }}</el-tag></div>
      <code>{{ event.command }}</code>
      <p>{{ statusLabel(event.status) }} · {{ new Date(event.createdAt).toLocaleString() }}</p>
      <p v-if="event.outputSummary" class="audit-output">{{ event.outputSummary }}</p>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { AuditEvent } from '@/stores/opsAgent'
import type { CommandRisk } from '@/utils/ops-permission'

defineProps<{ modelValue: boolean; events: AuditEvent[] }>()
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; clear: [] }>()
const { t } = useLocale()

function riskLabel(risk: CommandRisk) { return t(`ai.risk${risk === 'read_only' ? 'ReadOnly' : risk === 'change' ? 'Change' : risk === 'high_risk' ? 'High' : 'Unknown'}`) }
function riskTag(risk: CommandRisk) { return risk === 'high_risk' ? 'danger' : risk === 'change' ? 'warning' : risk === 'read_only' ? 'success' : 'info' }
function statusLabel(status: AuditEvent['status']) { return t(`ai.audit${status[0].toUpperCase()}${status.slice(1)}`) }
</script>

<style scoped lang="scss">
.audit-header { display: flex; align-items: center; justify-content: space-between; width: 100%; padding-right: 18px; }
.audit-empty { color: $color-text-secondary; font-size: $font-size-sm; text-align: center; padding: 40px 0; }
.audit-event { margin-bottom: 10px; padding: 10px; border: 1px solid $color-border-light; border-radius: $border-radius-sm; background: $color-bg-input; }
.audit-event-top { display: flex; justify-content: space-between; gap: 8px; font-size: $font-size-sm; }
code { display: block; margin-top: 7px; overflow-wrap: anywhere; color: $color-text-regular; font-size: 11px; }
p { margin: 7px 0 0; color: $color-text-secondary; font-size: 11px; line-height: 1.45; }
.audit-output { color: $color-text-placeholder; }
</style>
