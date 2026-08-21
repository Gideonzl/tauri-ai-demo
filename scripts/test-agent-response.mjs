import assert from 'node:assert/strict'
import { AgentActionStreamFilter, parseAgentResponse } from '../src/utils/agent-response.ts'

const raw = `结论：nginx 未启动。\n<agent_action>{"id":"a1","kind":"command","command":"systemctl status nginx --no-pager","purpose":"读取状态","verifyCommand":"systemctl is-active nginx"}</agent_action>`
const parsed = parseAgentResponse(raw)
assert.equal(parsed.actions.length, 1)
assert.equal(parsed.actions[0].command, 'systemctl status nginx --no-pager')
assert.doesNotMatch(parsed.displayMarkdown, /agent_action/)

const legacy = parseAgentResponse('检查日志\n<execute_command>journalctl -u nginx -n 80 --no-pager</execute_command>')
assert.equal(legacy.actions[0].protocol, 'legacy')
assert.equal(legacy.actions[0].command, 'journalctl -u nginx -n 80 --no-pager')

const malformed = parseAgentResponse('说明\n<agent_action>{bad json}</agent_action>')
assert.equal(malformed.actions.length, 0)
assert.equal(malformed.displayMarkdown, '说明')

const filter = new AgentActionStreamFilter()
const visible = [
  filter.push('准备检查<agent_'),
  filter.push('action>{"id":"a1","kind":"command","command":"uptime","purpose":"check"}</agent_action>完成'),
  filter.finish(),
].join('')
assert.equal(visible, '准备检查完成')

const incomplete = new AgentActionStreamFilter()
assert.equal(incomplete.push('可见内容<execute_command>uptime'), '可见内容')
assert.equal(incomplete.finish(), '')

console.log('Agent response checks passed')
