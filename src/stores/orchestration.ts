import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  OrchestrationTask,
  OrchestrationTaskStatus,
  OrchestrationTargetStatus,
  OrchestrationStepStatus,
} from '@/utils/ops-orchestration'

const MAX_SUMMARY_LENGTH = 500

function summarize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH)
}

export const useOrchestrationStore = defineStore('orchestration', () => {
  const currentTask = ref<OrchestrationTask | null>(null)

  const isRunning = computed(() => currentTask.value?.status === 'running' || currentTask.value?.status === 'verifying')

  function setTask(task: OrchestrationTask) {
    currentTask.value = task
  }

  function setTaskStatus(status: OrchestrationTaskStatus) {
    if (!currentTask.value) return
    currentTask.value.status = status
  }

  function setTargetStatus(hostId: string, status: OrchestrationTargetStatus, error = '') {
    const target = currentTask.value?.targets.find(item => item.hostId === hostId)
    if (!target) return
    target.status = status
    if (error) target.error = summarize(error)
  }

  function appendTargetSummary(hostId: string, summary: string) {
    const target = currentTask.value?.targets.find(item => item.hostId === hostId)
    if (!target) return
    target.summary = summarize(summary)
  }

  function setStepStatus(stepId: string, status: OrchestrationStepStatus) {
    const step = currentTask.value?.steps.find(item => item.id === stepId)
    if (!step) return
    step.status = status
  }

  function appendStepOutput(stepId: string, output: string, verification = false) {
    const step = currentTask.value?.steps.find(item => item.id === stepId)
    if (!step) return
    if (verification) step.verificationSummary = summarize(output)
    else step.outputSummary = summarize(output)
  }

  function stopTask() {
    if (!currentTask.value) return
    currentTask.value.status = 'stopped'
    currentTask.value.targets.forEach((target) => {
      if (target.status === 'pending' || target.status === 'connecting' || target.status === 'running') target.status = 'skipped'
    })
    currentTask.value.steps.forEach((step) => {
      if (step.status === 'pending' || step.status === 'waiting_approval' || step.status === 'running' || step.status === 'verifying') {
        step.status = 'skipped'
      }
    })
  }

  function clearTask() {
    currentTask.value = null
  }

  return {
    currentTask,
    isRunning,
    setTask,
    setTaskStatus,
    setTargetStatus,
    appendTargetSummary,
    setStepStatus,
    appendStepOutput,
    stopTask,
    clearTask,
  }
})
