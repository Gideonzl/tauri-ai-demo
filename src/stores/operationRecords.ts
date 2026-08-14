import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  loadOperationRecords,
  sanitizeOperationRecord,
  saveOperationRecords,
  type OperationRecord,
  type OperationRecordInput,
} from '@/utils/operation-records'

export const useOperationRecordsStore = defineStore('operationRecords', () => {
  const records = ref<OperationRecord[]>(loadOperationRecords(localStorage))

  const historyServers = computed(() => {
    const servers = new Map<string, { serverId: string; serverName: string; count: number }>()
    for (const record of records.value) {
      const existing = servers.get(record.serverId)
      if (existing) existing.count += 1
      else servers.set(record.serverId, { serverId: record.serverId, serverName: record.serverName, count: 1 })
    }
    return [...servers.values()].sort((left, right) => right.count - left.count)
  })

  function persist() {
    records.value = saveOperationRecords(localStorage, records.value)
  }

  function addRecord(input: OperationRecordInput): OperationRecord {
    const record = sanitizeOperationRecord(input)
    records.value.unshift(record)
    persist()
    return record
  }

  function updateRecord(id: string, patch: Partial<OperationRecord>): OperationRecord | null {
    const index = records.value.findIndex(record => record.id === id)
    if (index < 0) return null
    const updated = sanitizeOperationRecord({ ...records.value[index], ...patch, id })
    records.value.splice(index, 1, updated)
    persist()
    return updated
  }

  function getEntries(serverId: string): OperationRecord[] {
    return records.value.filter(record => record.serverId === serverId)
  }

  function getRecord(id: string): OperationRecord | null {
    return records.value.find(record => record.id === id) || null
  }

  function deleteRecord(id: string) {
    records.value = records.value.filter(record => record.id !== id)
    persist()
  }

  function clearServer(serverId: string) {
    records.value = records.value.filter(record => record.serverId !== serverId)
    persist()
  }

  function clearAll() {
    records.value = []
    persist()
  }

  function purgeOrphaned(existingServerIds: string[]) {
    const ids = new Set(existingServerIds)
    const filtered = records.value.filter(record => ids.has(record.serverId))
    if (filtered.length === records.value.length) return
    records.value = filtered
    persist()
  }

  function reload() {
    records.value = loadOperationRecords(localStorage)
  }

  return {
    records,
    historyServers,
    addRecord,
    updateRecord,
    getEntries,
    getRecord,
    deleteRecord,
    clearServer,
    clearAll,
    purgeOrphaned,
    reload,
  }
})
