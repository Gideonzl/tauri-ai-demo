import assert from 'node:assert/strict'
import { executeAgentAction } from '../src/utils/agent-execution.ts'

const action = {
  id: 'a1',
  kind: 'command',
  command: 'systemctl restart nginx',
  purpose: 'restart',
  verifyCommand: 'systemctl is-active nginx',
  protocol: 'structured',
}

let runs = 0
const denied = await executeAgentAction(action, {
  authorize: async () => ({ allowed: false, denialMessage: 'blocked' }),
  run: async () => { runs++; throw new Error('must not run') },
})
assert.equal(denied.status, 'denied')
assert.equal(runs, 0)

const states = []
const commands = []
const completed = []
let firstAttempt = true
const success = await executeAgentAction(action, {
  authorize: async () => ({ allowed: true, denialMessage: '', auditId: 'audit-1' }),
  run: async (command) => {
    commands.push(command)
    if (firstAttempt) {
      firstAttempt = false
      return { stdout: '', stderr: 'channel closed', exitCode: null, timedOut: false, channelError: true }
    }
    return {
      stdout: command.includes('is-active') ? 'active' : '',
      stderr: '',
      exitCode: 0,
      timedOut: false,
      channelError: false,
    }
  },
  onState: state => states.push(state),
  onCompleted: (command, result) => completed.push([command, result.formatted]),
})
assert.equal(success.status, 'verified')
assert.deepEqual(commands, [
  'systemctl restart nginx',
  'systemctl restart nginx',
  'systemctl is-active nginx',
])
assert.deepEqual(states, ['awaiting_authorization', 'executing', 'verifying'])
assert.equal(completed.length, 2)
assert.match(completed[0][1], /退出码 0，无输出/)

const failed = await executeAgentAction({ ...action, verifyCommand: undefined }, {
  authorize: async () => ({ allowed: true, denialMessage: '' }),
  run: async () => ({ stdout: '', stderr: 'permission denied', exitCode: 1, timedOut: false, channelError: false }),
})
assert.equal(failed.status, 'failed')
assert.match(failed.commandResult.formatted, /退出码 1/)

console.log('Agent execution core checks passed')
