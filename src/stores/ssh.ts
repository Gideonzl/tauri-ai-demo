import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { reorderSessionTabs } from '@/utils/sessionTabOrder'

export interface SshServer { id: string; name: string; host: string; port: number; username: string; authType: 'password' | 'key'; password?: string; keyPath?: string; keyRef?: string; keyPassphrase?: string; group?: string; remark?: string; lastConnected?: number }
export interface ServerGroup { id: string; name: string; color?: string; sortOrder?: number }
export type SshStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting'
export interface SshSession { id: string; serverId: string; serverName: string; status: SshStatus; createdAt: number; error?: string; realSessionId?: string }
export interface QuickCommand { id: string; name: string; command: string; description: string; category?: string }

export const useSshStore = defineStore('ssh', () => {
  const servers = ref<SshServer[]>([])
  const groups = ref<ServerGroup[]>([])
  const sessions = ref<SshSession[]>([])
  const activeSessionId = ref<string>('')
  const showConnectDialog = ref(false)
  const editingServer = ref<SshServer | null>(null)
  const searchQuery = ref('')
  const selectedGroupName = ref('')
  const quickCommands = ref<QuickCommand[]>([])
  const openFiles = ref<Array<{path: string; name: string; content: string; loading: boolean}>>([])
  const activeFileIndex = ref(-1)
  const ptyRequestCount = ref(0) // counter incremented when PTY shell should be opened

  // Cross-view command injection — history/other views push a command that the
  // active TerminalPanel (kept alive) picks up and runs.
  const injectedCommand = ref('')
  const injectCommandSeq = ref(0)
  function runInTerminal(cmd: string) { injectedCommand.value = cmd; injectCommandSeq.value++ }

  const activeSession = computed<SshSession | null>(() => sessions.value.find(s => s.id === activeSessionId.value) || null)

  const filteredServers = computed<SshServer[]>(() => {
    let list = servers.value
    if (selectedGroupName.value) {
      list = list.filter(s => s.group === selectedGroupName.value)
    }
    const q = searchQuery.value.trim().toLowerCase()
    if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q) || s.username.toLowerCase().includes(q) || (s.group && s.group.toLowerCase().includes(q)))
    return list.sort((a, b) => (b.lastConnected || 0) - (a.lastConnected || 0))
  })

  const allGroupNames = computed<string[]>(() => {
    const n = new Set<string>()
    groups.value.forEach(g => n.add(g.name))
    servers.value.forEach(s => { if (s.group) n.add(s.group) })
    return Array.from(n).sort()
  })

  function genId(): string { return `ssh-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }
  function addServer(data: Omit<SshServer, 'id'>) { const s: SshServer = { id: genId(), ...data }; servers.value.push(s); if (data.group && !groups.value.find(g => g.name === data.group)) groups.value.push({ id: genId(), name: data.group }); saveToStorage(); return s }
  function updateServer(id: string, data: Partial<SshServer>) { const i = servers.value.findIndex(s => s.id === id); if (i !== -1) { servers.value[i] = { ...servers.value[i], ...data, id }; saveToStorage() } }
  function deleteServer(id: string) { servers.value = servers.value.filter(s => s.id !== id); sessions.value = sessions.value.filter(s => s.serverId !== id); activeSessionId.value = sessions.value[0]?.id || ''; saveToStorage() }
  function addGroup(name: string) { if (!name.trim() || groups.value.find(g => g.name === name.trim())) return; groups.value.push({ id: genId(), name: name.trim(), sortOrder: groups.value.length }); saveToStorage() }
  function deleteGroup(groupId: string) { const g = groups.value.find(g => g.id === groupId); if (!g) return; servers.value.forEach(s => { if (s.group === g.name) s.group = undefined }); groups.value = groups.value.filter(g => g.id !== groupId); if (selectedGroupName.value === g.name) selectedGroupName.value = ''; saveToStorage() }
  function renameGroup(groupId: string, newName: string) { const g = groups.value.find(g => g.id === groupId); if (!g || !newName.trim()) return; const old = g.name; g.name = newName.trim(); servers.value.forEach(s => { if (s.group === old) s.group = newName.trim() }); saveToStorage() }
  function addQuickCommand(cmd: Omit<QuickCommand, 'id'>) { const qc: QuickCommand = { id: genId(), ...cmd }; quickCommands.value.push(qc); saveToStorage(); return qc }
  function updateQuickCommand(id: string, data: Partial<QuickCommand>) { const i = quickCommands.value.findIndex(c => c.id === id); if (i !== -1) { quickCommands.value[i] = { ...quickCommands.value[i], ...data, id }; saveToStorage() } }
  function deleteQuickCommand(id: string) { quickCommands.value = quickCommands.value.filter(c => c.id !== id); saveToStorage() }
  function createSession(serverId: string): SshSession { const server = servers.value.find(s => s.id === serverId); if (!server) throw new Error('no server'); server.lastConnected = Date.now(); saveToStorage(); const session: SshSession = { id: genId(), serverId, serverName: server.name, status: 'connecting', createdAt: Date.now() }; sessions.value.push(session); activeSessionId.value = session.id; return session }
  function updateSessionStatus(sessionId: string, status: SshStatus, error?: string) { const s = sessions.value.find(s => s.id === sessionId); if (s) { s.status = status; s.error = error } }
  function setRealSessionId(sessionId: string, realSessionId: string) { const s = sessions.value.find(s => s.id === sessionId); if (s) s.realSessionId = realSessionId }
  function requestPtyShell() { ptyRequestCount.value++ }
  function closeSession(sessionId: string) { sessions.value = sessions.value.filter(s => s.id !== sessionId); if (activeSessionId.value === sessionId) activeSessionId.value = sessions.value[0]?.id || '' }
  function switchSession(sessionId: string) { activeSessionId.value = sessionId }
  function reorderSessions(draggedId: string, targetId: string) { sessions.value = reorderSessionTabs(sessions.value, draggedId, targetId) }
  const STORAGE_KEYS = { servers: 'ssh-servers', groups: 'ssh-groups', quickCommands: 'ssh-quick-commands' }
  function saveToStorage() { try { const d = localStorage; d.setItem(STORAGE_KEYS.servers, JSON.stringify(servers.value)); d.setItem(STORAGE_KEYS.groups, JSON.stringify(groups.value)); d.setItem(STORAGE_KEYS.quickCommands, JSON.stringify(quickCommands.value)) } catch (e) { console.error(e) } }
  function loadFromStorage() { try { const d = localStorage; const sr = d.getItem(STORAGE_KEYS.servers); if (sr) servers.value = JSON.parse(sr); const gr = d.getItem(STORAGE_KEYS.groups); if (gr) groups.value = JSON.parse(gr); const qr = d.getItem(STORAGE_KEYS.quickCommands); if (qr) quickCommands.value = JSON.parse(qr) } catch (e) { console.error(e) } }
  function init() { loadFromStorage(); const demoIds = new Set(['Web Server', 'DB Server', 'Dev Server', 'Staging', 'Monitor']); const hasDemo = servers.value.some(s => demoIds.has(s.name)); if (hasDemo) { servers.value = servers.value.filter(s => !demoIds.has(s.name)); groups.value = []; servers.value.forEach(s => { if (s.group && !groups.value.find(g => g.name === s.group)) groups.value.push({ id: genId(), name: s.group }) }); saveToStorage() } }
  return { servers, groups, sessions, activeSessionId, activeSession, showConnectDialog, editingServer, searchQuery, selectedGroupName, quickCommands, openFiles, activeFileIndex, ptyRequestCount, injectedCommand, injectCommandSeq, runInTerminal, filteredServers, allGroupNames, addServer, updateServer, deleteServer, addGroup, deleteGroup, renameGroup, addQuickCommand, updateQuickCommand, deleteQuickCommand, createSession, updateSessionStatus, setRealSessionId, requestPtyShell, closeSession, switchSession, reorderSessions, init }
})
