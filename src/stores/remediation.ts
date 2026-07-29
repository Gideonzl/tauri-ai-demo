import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RemediationPlan, RemediationPlanStatus, RemediationStepStatus } from '@/utils/ops-remediation'

const MAX_OUTPUT_LENGTH = 500

function summarize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_OUTPUT_LENGTH)
}

export const useRemediationStore = defineStore('remediation', () => {
  const currentPlan = ref<RemediationPlan | null>(null)

  const isRunning = computed(() => currentPlan.value?.status === 'running')

  function setPlan(plan: RemediationPlan) {
    currentPlan.value = plan
  }

  function setPlanStatus(status: RemediationPlanStatus) {
    if (!currentPlan.value) return
    currentPlan.value.status = status
  }

  function setStepStatus(stepId: string, status: RemediationStepStatus) {
    const item = currentPlan.value?.steps.find(step => step.id === stepId)
    if (!item) return
    item.status = status
  }

  function setStepAudit(stepId: string, auditId?: string) {
    const item = currentPlan.value?.steps.find(step => step.id === stepId)
    if (!item) return
    item.auditId = auditId
  }

  function appendStepOutput(stepId: string, output: string, verification = false) {
    const item = currentPlan.value?.steps.find(step => step.id === stepId)
    if (!item) return
    if (verification) item.verificationSummary = summarize(output)
    else item.outputSummary = summarize(output)
  }

  function stopPlan() {
    if (!currentPlan.value) return
    currentPlan.value.status = 'stopped'
    currentPlan.value.steps.forEach((step) => {
      if (step.status === 'pending' || step.status === 'waiting_approval' || step.status === 'running' || step.status === 'verifying') {
        step.status = 'skipped'
      }
    })
  }

  function clearPlan() {
    currentPlan.value = null
  }

  return {
    currentPlan,
    isRunning,
    setPlan,
    setPlanStatus,
    setStepStatus,
    setStepAudit,
    appendStepOutput,
    stopPlan,
    clearPlan,
  }
})
