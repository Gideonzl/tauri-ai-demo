import assert from 'node:assert/strict'
import {
  OPERATION_RECORDS_KEY,
  loadOperationRecords,
  sanitizeOperationRecord,
  saveOperationRecords,
  formatOperationForAi,
} from '../src/utils/operation-records.ts'

class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, value) }
}

const base = {
  id: 'op-1', source: 'terminal', serverId: 's1', serverName: 'demo',
  command: 'pwd', output: '/root', exitCode: null, timedOut: false,
  truncated: false, status: 'success', startedAt: 100, finishedAt: 125,
}

const redacted = sanitizeOperationRecord({
  ...base,
  command: 'curl -H "Authorization: Bearer secret-token" https://user:pass@example.com',
  output: 'password=abc123\n-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----',
})
assert.doesNotMatch(redacted.command, /secret-token|user:pass/)
assert.doesNotMatch(redacted.output, /abc123|BEGIN RSA PRIVATE KEY/)

const longOutput = sanitizeOperationRecord({ ...base, output: 'x'.repeat(40_000) })
assert.equal(longOutput.output.length, 32 * 1024)
assert.equal(longOutput.truncated, true)

const storage = new MemoryStorage()
storage.setItem('cmd-history', JSON.stringify([{ id: 'old', serverId: 's1', serverName: 'demo', command: 'uptime', timestamp: 50 }]))
const migrated = loadOperationRecords(storage)
assert.equal(migrated[0].command, 'uptime')
assert.equal(migrated[0].status, 'unknown')
assert.equal(migrated[0].output, '')

saveOperationRecords(storage, Array.from({ length: 220 }, (_, index) => ({ ...base, id: `op-${index}`, startedAt: index })))
assert.equal(JSON.parse(storage.getItem(OPERATION_RECORDS_KEY)).length, 200)
assert.match(formatOperationForAi(base), /pwd[\s\S]*\/root/)

console.log('Operation record model checks passed')
