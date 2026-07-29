<template>
  <div class="remediation-card">
    <div class="remediation-top">
      <div>
        <div class="remediation-title">{{ plan.title }}</div>
        <div class="remediation-sub">{{ plan.hostName }} · {{ t(`ai.remediationIssue_${plan.issueType}`) }}</div>
      </div>
      <el-tag size="small" :type="statusType(plan.status)">{{ t(`ai.remediationStatus_${plan.status}`) }}</el-tag>
    </div>

    <div class="evidence-list">
      <div v-for="item in plan.evidence" :key="item.source" class="evidence-item">
        <el-tag
          size="small"
          effect="plain"
          :type="item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'"
        >
          {{ item.source }}
        </el-tag>
        <span>{{ item.summary }}</span>
      </div>
    </div>

    <div class="step-list">
      <div v-for="step in plan.steps" :key="step.id" class="step-item">
        <div class="step-head">
          <span>{{ step.title }}</span>
          <el-tag size="small" :type="riskType(step.risk)">{{ t(`ai.risk_${step.risk}`) }}</el-tag>
          <el-tag size="small" effect="plain">{{ t(`ai.remediationStep_${step.status}`) }}</el-tag>
        </div>
        <div class="step-goal">{{ step.goal }}</div>
        <code>{{ step.command }}</code>
        <code class="verify">{{ step.verifyCommand }}</code>
        <p v-if="step.outputSummary">{{ step.outputSummary }}</p>
        <p v-if="step.verificationSummary">{{ step.verificationSummary }}</p>
      </div>
    </div>

    <div class="remediation-actions">
      <el-button size="small" type="primary" :loading="running" :disabled="running || plan.status === 'completed'" @click="emit('execute')">
        {{ t('ai.remediationExecute') }}
      </el-button>
      <el-button size="small" :disabled="!running" @click="emit('stop')">
        {{ t('ai.remediationStop') }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { CommandRisk } from '@/utils/ops-permission'
import type { RemediationPlan, RemediationPlanStatus } from '@/utils/ops-remediation'

defineProps<{ plan: RemediationPlan; running: boolean }>()
const emit = defineEmits<{ execute: []; stop: [] }>()
const { t } = useLocale()

function riskType(risk: CommandRisk) {
  if (risk === 'high_risk') return 'danger'
  if (risk === 'change' || risk === 'unknown') return 'warning'
  return 'success'
}

function statusType(status: RemediationPlanStatus) {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
}
</script>

<style scoped lang="scss">
.remediation-card {
  margin: 8px 0 12px;
  padding: 10px;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-md;
  background: $color-bg-surface;
}

.remediation-top {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  align-items: flex-start;
}

.remediation-title {
  font-weight: 600;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.remediation-sub {
  margin-top: 2px;
  font-size: $font-size-xs;
  color: $color-text-placeholder;
}

.evidence-list {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}

.evidence-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: $font-size-xs;
  color: $color-text-secondary;
}

.step-list {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.step-item {
  padding: 8px;
  border: 1px solid $color-border-light;
  border-radius: $border-radius-sm;
  background: $color-bg-input;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  font-size: $font-size-sm;
  color: $color-text-primary;
}

.step-goal {
  margin: 4px 0;
  font-size: $font-size-xs;
  color: $color-text-secondary;
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

p {
  margin: 5px 0 0;
  color: $color-text-placeholder;
  font-size: $font-size-xs;
}

.remediation-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 10px;
}
</style>
