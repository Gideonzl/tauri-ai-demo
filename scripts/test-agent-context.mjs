import assert from 'node:assert/strict'
import { buildAgentContext, formatAgentContext } from '../src/utils/agent-context.ts'

const operations = Array.from({ length: 12 }, (_, index) => ({
  id: `op-${index}`,
  source: 'terminal',
  serverId: index === 11 ? 'other' : 'host-1',
  serverName: 'demo',
  command: index === 1
    ? 'curl -H "Authorization: Bearer secret-token" https://example.com'
    : `echo ${index}`,
  cwd: '/root',
  output: index === 2 ? `password=hidden\n${'x'.repeat(6000)}` : `output ${index}`,
  exitCode: index === 3 ? 1 : 0,
  timedOut: false,
  truncated: false,
  status: index === 3 ? 'failed' : 'success',
  startedAt: index,
}))

const snapshot = buildAgentContext({
  capturedAt: 100,
  host: {
    id: 'host-1',
    name: 'demo',
    address: '10.0.0.1',
    port: 22,
    username: 'root',
    connectionStatus: 'connected',
  },
  workspace: { view: 'terminal', cwd: '/root' },
  operations,
  permissionLevel: 'controlled',
  activeIssue: null,
})
const prompt = formatAgentContext(snapshot)

assert.equal(snapshot.recentOperations.length, 8)
assert.ok(snapshot.recentOperations.some(item => item.id === 'op-3'))
assert.ok(snapshot.recentOperations.every(item => item.serverId === 'host-1'))
assert.doesNotMatch(prompt, /secret-token|password=hidden/)
assert.ok(snapshot.recentOperations.every(item => item.output.length <= 4096))
assert.ok(prompt.length <= 24 * 1024)

const oversized = buildAgentContext({
  capturedAt: 100,
  host: snapshot.host,
  workspace: { view: 'logs', selectedPath: '/var/log/app.log' },
  operations: Array.from({ length: 8 }, (_, index) => ({
    ...operations[0],
    id: `large-${index}`,
    output: 'z'.repeat(4096),
    startedAt: 100 + index,
  })),
  permissionLevel: 'readonly',
  activeIssue: null,
})
assert.ok(formatAgentContext(oversized).length <= 24 * 1024)

console.log('Agent context checks passed')
