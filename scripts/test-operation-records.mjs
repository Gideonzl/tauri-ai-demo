import assert from 'node:assert/strict'
import {
  OPERATION_RECORDS_KEY,
  loadOperationRecords,
  sanitizeOperationRecord,
  saveOperationRecords,
  formatOperationForAi,
} from '../src/utils/operation-records.ts'
import { TerminalCommandCapture } from '../src/utils/terminal-command-capture.ts'

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

const completed = []
const completionAnchors = []
let clock = 1000
const capture = new TerminalCommandCapture({
  onComplete: (record, anchor) => {
    completed.push(record)
    completionAnchors.push(anchor)
  },
  now: () => clock,
})
const context = { serverId: 's1', serverName: 'demo', sessionId: 'real-1', cwd: '/root' }

const firstCommandAnchor = { line: 'pwd' }
capture.submit('pwd', context, firstCommandAnchor)
clock = 1025
capture.append('pwd\r\n/root\r\nroot@demo:~# ')
assert.equal(completed[0].command, 'pwd')
assert.equal(completed[0].output, '/root')
assert.equal(completed[0].durationMs, 25)
assert.equal(completed[0].status, 'success')
assert.equal(completionAnchors[0], firstCommandAnchor, 'completion must retain the command-line anchor created at submit time')

capture.submit('true', context)
capture.append('true\r\nroot@demo:~# ')
assert.equal(completed[1].output, '')

capture.submit('tail -f app.log', context)
capture.append('line 1\r\n')
capture.interrupt()
capture.append('^C\r\nroot@demo:~# ')
assert.equal(completed[2].status, 'interrupted')
assert.match(completed[2].output, /line 1/)

capture.submit('sleep 10', context)
capture.append('\x1b[32mworking\x1b[0m\r\n')
capture.submit('echo next', context)
assert.equal(completed[3].status, 'unknown')
assert.equal(completed[3].output, 'working')

capture.flush()
assert.equal(completed[4].status, 'unknown')

console.log('Operation record model checks passed')
