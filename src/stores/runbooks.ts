import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createCustomRunbook,
  getBatchRunbooks,
  isSafeBatchRunbook,
  type CreateCustomRunbookInput,
  type OpsRunbook,
} from '@/utils/ops-runbooks'

const CUSTOM_RUNBOOKS_KEY = 'ops-custom-runbooks'
const MAX_CUSTOM_RUNBOOKS = 50

function readStorage(): unknown {
  try {
    return localStorage.getItem(CUSTOM_RUNBOOKS_KEY)
      ? JSON.parse(localStorage.getItem(CUSTOM_RUNBOOKS_KEY) || '[]')
      : []
  } catch {
    return []
  }
}

function writeStorage(runbooks: OpsRunbook[]) {
  try {
    localStorage.setItem(CUSTOM_RUNBOOKS_KEY, JSON.stringify(runbooks))
  } catch {
    // A custom runbook is a convenience feature. Persistence failure must not break batch ops.
  }
}

function sanitizeCustomRunbooks(value: unknown): OpsRunbook[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item): OpsRunbook | null => {
      const validation = createCustomRunbook({
        title: typeof item?.title === 'string' ? item.title : '',
        description: typeof item?.description === 'string' ? item.description : '',
        command: typeof item?.command === 'string' ? item.command : '',
        recommendedConcurrency: typeof item?.recommendedConcurrency === 'number' ? item.recommendedConcurrency : 2,
      })
      if (!validation.valid || !validation.runbook || !isSafeBatchRunbook(validation.runbook)) return null
      return {
        ...validation.runbook,
        id: typeof item?.id === 'string' ? item.id : validation.runbook.id,
        createdAt: typeof item?.createdAt === 'number' ? item.createdAt : validation.runbook.createdAt,
      }
    })
    .filter((item): item is OpsRunbook => Boolean(item))
    .slice(0, MAX_CUSTOM_RUNBOOKS)
}

export const useRunbookStore = defineStore('runbooks', () => {
  const customRunbooks = ref<OpsRunbook[]>(sanitizeCustomRunbooks(readStorage()))

  const batchRunbooks = computed(() => [...getBatchRunbooks(), ...customRunbooks.value])

  function persist() {
    customRunbooks.value = sanitizeCustomRunbooks(customRunbooks.value)
    writeStorage(customRunbooks.value)
  }

  function addCustomRunbook(input: CreateCustomRunbookInput): { ok: boolean; errors: string[]; runbook?: OpsRunbook } {
    const validation = createCustomRunbook(input)
    if (!validation.valid || !validation.runbook || !isSafeBatchRunbook(validation.runbook)) {
      return { ok: false, errors: validation.errors.length ? validation.errors : ['custom runbook command must be read-only'] }
    }
    customRunbooks.value.unshift(validation.runbook)
    customRunbooks.value = customRunbooks.value.slice(0, MAX_CUSTOM_RUNBOOKS)
    persist()
    return { ok: true, errors: [], runbook: validation.runbook }
  }

  function removeCustomRunbook(id: string) {
    customRunbooks.value = customRunbooks.value.filter(runbook => runbook.id !== id)
    persist()
  }

  function clearCustomRunbooks() {
    customRunbooks.value = []
    try { localStorage.removeItem(CUSTOM_RUNBOOKS_KEY) } catch { /* ignore */ }
  }

  return {
    customRunbooks,
    batchRunbooks,
    addCustomRunbook,
    removeCustomRunbook,
    clearCustomRunbooks,
  }
})
