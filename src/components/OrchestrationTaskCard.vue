<template>
  <div class="orchestration-card">
    <div class="orch-head">
      <div>
        <div class="orch-title">{{ task.title }}</div>
        <div class="orch-sub">
          {{ t(`ops.orchMode_${task.mode}`) }} · {{ t(`ops.orchType_${task.taskType}`) }} · {{ t('ops.orchConcurrency', { n: task.concurrency }) }}
        </div>
      </div>
      <el-tag size="small" :type="statusType(task.status)">{{ t(`ops.orchStatus_${task.status}`) }}</el-tag>
    </div>

    <div class="orch-steps">
      <div v-for="step in task.steps" :key="step.id" class="orch-step">
        <div class="orch-step-top">
          <span>{{ step.title }}</span>
          <el-tag size="small" :type="riskType(step.risk)">{{ t(`ai.risk_${step.risk}`) }}</el-tag>
          <el-tag size="small" effect="plain">{{ t(`ops.orchStep_${step.status}`) }}</el-tag>
        </div>
        <code>{{ step.command }}</code>
        <code v-if="step.verifyCommand" class="verify">{{ step.verifyCommand }}</code>
      </div>
    </div>

    <div class="orch-targets">
      <div v-for="target in task.targets" :key="target.hostId" class="orch-target" :class="target.status">
        <span class="target-name">{{ target.hostName }}</span>
        <span class="target-address">{{ target.hostAddress }}</span>
        <el-tag size="small" effect="plain">{{ t(`ops.orchTarget_${target.status}`) }}</el-tag>
        <p v-if="target.summary || target.error">{{ target.error || target.summary }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { CommandRisk } from '@/utils/ops-permission'
import type { OrchestrationTask, OrchestrationTaskStatus } from '@/utils/ops-orchestration'

defineProps<{ task: OrchestrationTask; running: boolean }>()
const { t } = useLocale()

function riskType(risk: CommandRisk) {
  if (risk === 'high_risk') return 'danger'
  if (risk === 'change' || risk === 'unknown') return 'warning'
  return 'success'
}

function statusType(status: OrchestrationTaskStatus) {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running' || status === 'verifying') return 'warning'
  return 'info'
}
</script>

<style scoped lang="scss">
.orchestration-card {
  padding: 10px;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-md;
  background: $color-bg-surface;
}

.orch-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.orch-title {
  font-size: $font-size-sm;
  font-weight: 600;
  color: $color-text-primary;
}

.orch-sub {
  margin-top: 2px;
  color: $color-text-placeholder;
  font-size: $font-size-xs;
}

.orch-steps,
.orch-targets {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.orch-step,
.orch-target {
  padding: 8px;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-sm;
  background: $color-bg-input;
}

.orch-step-top {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

code {
  display: block;
  margin-top: 4px;
  padding: 5px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.18);
  color: $color-text-secondary;
  white-space: pre-wrap;
  word-break: break-all;
  font-size: 11px;
}

code.verify {
  color: $color-info;
}

.orch-target {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(120px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.target-name {
  color: $color-text-primary;
  font-size: $font-size-sm;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.target-address {
  color: $color-text-placeholder;
  font-size: $font-size-xs;
  font-family: $font-family-mono;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

p {
  grid-column: 1 / -1;
  margin: 0;
  color: $color-text-placeholder;
  font-size: $font-size-xs;
}
</style>
