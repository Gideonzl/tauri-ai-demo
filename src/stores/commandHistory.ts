/**
 * 命令历史 Store — 按服务器分类存储终端命令历史
 * localStorage 持久化，每个服务器最多保留 500 条记录
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface CommandEntry {
  id: string
  serverId: string
  serverName: string
  command: string
  timestamp: number
  cwd?: string  // working directory when command was executed
}

const MAX_PER_SERVER = 500
const STORAGE_KEY = 'cmd-history'

export const useCommandHistoryStore = defineStore('commandHistory', () => {
  const entries = ref<CommandEntry[]>([])

  // Unique server list from history entries (for dropdown)
  const historyServers = computed(() => {
    const map = new Map<string, { serverId: string; serverName: string; count: number }>()
    for (const e of entries.value) {
      const existing = map.get(e.serverId)
      if (existing) {
        existing.count++
      } else {
        map.set(e.serverId, { serverId: e.serverId, serverName: e.serverName, count: 1 })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  })

  function addEntry(serverId: string, serverName: string, command: string, cwd?: string) {
    // Strip ANSI escape codes and control characters
    const clean = command
      .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .trim()
    if (!clean) return

    entries.value.push({
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      serverId,
      serverName,
      command: clean,
      timestamp: Date.now(),
      cwd,
    })

    // Trim old entries per server
    const serverEntries = entries.value.filter(e => e.serverId === serverId)
    if (serverEntries.length > MAX_PER_SERVER) {
      const toRemove = serverEntries.slice(0, serverEntries.length - MAX_PER_SERVER)
      entries.value = entries.value.filter(e => !toRemove.includes(e))
    }

    saveToStorage()
  }

  function getEntries(serverId: string): CommandEntry[] {
    return entries.value
      .filter(e => e.serverId === serverId)
      .sort((a, b) => b.timestamp - a.timestamp)
  }

  function deleteEntry(id: string) {
    entries.value = entries.value.filter(e => e.id !== id)
    saveToStorage()
  }

  function clearServer(serverId: string) {
    entries.value = entries.value.filter(e => e.serverId !== serverId)
    saveToStorage()
  }

  function clearAll() {
    entries.value = []
    saveToStorage()
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (Array.isArray(data)) {
          entries.value = data
        }
      }
    } catch { /* ignore */ }
  }

  function saveToStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
    } catch { /* ignore */ }
  }

  // Initialize
  loadFromStorage()

  return {
    entries,
    historyServers,
    addEntry,
    getEntries,
    deleteEntry,
    clearServer,
    clearAll,
  }
})
