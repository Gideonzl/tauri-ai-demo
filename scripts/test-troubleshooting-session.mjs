import assert from 'node:assert/strict'
import {
  TROUBLESHOOTING_STORAGE_KEY,
  canTransitionTroubleshooting,
  loadTroubleshootingSessions,
  saveTroubleshootingSessions,
} from '../src/utils/troubleshooting-session.ts'

class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, value) }
  removeItem(key) { this.data.delete(key) }
}

assert.equal(canTransitionTroubleshooting('idle', 'assessing'), true)
assert.equal(canTransitionTroubleshooting('assessing', 'resolved'), false)
assert.equal(canTransitionTroubleshooting('verifying', 'resolved'), true)
assert.equal(canTransitionTroubleshooting('blocked', 'assessing'), true)

const storage = new MemoryStorage()
const sessions = Array.from({ length: 55 }, (_, index) => ({
  id: `issue-${index}`,
  conversationId: `conv-${index}`,
  hostId: 'host-1',
  hostName: 'demo',
  summary: `issue ${index}`,
  state: 'assessing',
  evidenceRecordIds: [],
  actionCount: 0,
  modelRoundCount: 0,
  createdAt: index,
  updatedAt: index,
}))
saveTroubleshootingSessions(storage, sessions)
const loaded = loadTroubleshootingSessions(storage)
assert.equal(loaded.length, 50)
assert.equal(loaded[0].id, 'issue-54')

storage.setItem(TROUBLESHOOTING_STORAGE_KEY, JSON.stringify([{ ...sessions[0], summary: 'token=secret-value' }]))
assert.doesNotMatch(loadTroubleshootingSessions(storage)[0].summary, /secret-value/)
console.log('Troubleshooting session checks passed')
