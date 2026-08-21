import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  MAX_AGENT_ACTIONS,
  MAX_AGENT_MODEL_ROUNDS,
  TROUBLESHOOTING_STORAGE_KEY,
  canTransitionTroubleshooting,
  loadTroubleshootingSessions,
  saveTroubleshootingSessions,
  type TroubleshootingSession,
  type TroubleshootingState,
} from '@/utils/troubleshooting-session'

function createIssueId(): string {
  return `issue-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useTroubleshootingStore = defineStore('troubleshooting', () => {
  const sessions = ref<TroubleshootingSession[]>([])

  function persist() {
    sessions.value = saveTroubleshootingSessions(localStorage, sessions.value)
  }

  function byConversation(conversationId: string): TroubleshootingSession | null {
    return sessions.value.find(item => item.conversationId === conversationId) || null
  }

  function startOrResume(input: {
    conversationId: string
    hostId: string
    hostName: string
    summary: string
  }): TroubleshootingSession {
    const existing = byConversation(input.conversationId)
    if (existing) {
      existing.hostId = input.hostId
      existing.hostName = input.hostName
      if (!existing.summary) existing.summary = input.summary
      if (['idle', 'resolved', 'blocked', 'cancelled'].includes(existing.state)) existing.state = 'assessing'
      existing.updatedAt = Date.now()
      persist()
      return existing
    }

    const now = Date.now()
    const session: TroubleshootingSession = {
      id: createIssueId(),
      conversationId: input.conversationId,
      hostId: input.hostId,
      hostName: input.hostName,
      summary: input.summary,
      state: 'assessing',
      facts: [],
      evidenceRecordIds: [],
      actionCount: 0,
      modelRoundCount: 0,
      createdAt: now,
      updatedAt: now,
    }
    sessions.value.unshift(session)
    persist()
    return session
  }

  function setState(conversationId: string, state: TroubleshootingState, error?: string): boolean {
    const session = byConversation(conversationId)
    if (!session || !canTransitionTroubleshooting(session.state, state)) return false
    session.state = state
    session.lastError = error || undefined
    session.updatedAt = Date.now()
    persist()
    return true
  }

  function addEvidence(conversationId: string, operationRecordId: string) {
    const session = byConversation(conversationId)
    if (!session || !operationRecordId || session.evidenceRecordIds.includes(operationRecordId)) return
    session.evidenceRecordIds.unshift(operationRecordId)
    session.evidenceRecordIds = session.evidenceRecordIds.slice(0, 20)
    session.updatedAt = Date.now()
    persist()
  }

  function incrementAction(conversationId: string): boolean {
    const session = byConversation(conversationId)
    if (!session || session.actionCount >= MAX_AGENT_ACTIONS) return false
    session.actionCount += 1
    session.updatedAt = Date.now()
    persist()
    return true
  }

  function incrementModelRound(conversationId: string): boolean {
    const session = byConversation(conversationId)
    if (!session || session.modelRoundCount >= MAX_AGENT_MODEL_ROUNDS) return false
    session.modelRoundCount += 1
    session.updatedAt = Date.now()
    persist()
    return true
  }

  function deleteByConversation(conversationId: string) {
    sessions.value = sessions.value.filter(item => item.conversationId !== conversationId)
    persist()
  }

  function clearAll() {
    sessions.value = []
    try { localStorage.removeItem(TROUBLESHOOTING_STORAGE_KEY) } catch { /* ignore */ }
  }

  function init() {
    sessions.value = loadTroubleshootingSessions(localStorage)
  }

  return {
    sessions,
    byConversation,
    startOrResume,
    setState,
    addEvidence,
    incrementAction,
    incrementModelRound,
    deleteByConversation,
    clearAll,
    init,
  }
})
