import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ai = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')
const settings = readFileSync(resolve(root, 'src/views/SettingsView.vue'), 'utf8')
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
const aiChat = readFileSync(resolve(root, 'src/utils/ai-chat.ts'), 'utf8')
const prompt = readFileSync(resolve(root, 'src/utils/agent-prompt.ts'), 'utf8')
const context = readFileSync(resolve(root, 'src/utils/agent-context.ts'), 'utf8')

assert.match(ai, /buildAgentContext\s*\(/, 'AI send must build a bounded context snapshot')
assert.match(ai, /troubleshootingStore\.startOrResume/, 'AI chat must start or resume the conversation task')
assert.match(ai, /troubleshootingStore\.setState/, 'stream state must persist in the task store')
assert.match(ai, /operationRecordsStore\.addRecord/, 'AI commands must create unified operation records')
assert.match(ai, /troubleshootingStore\.addEvidence/, 'operation records must attach to the active task')
assert.ok(settings.includes("'ai-troubleshooting-sessions-v1'"), 'AI/history data category must own troubleshooting sessions')
assert.match(settings, /troubleshootingStore\.clearAll\(\)/, 'data clearing must reset the in-memory task store')
assert.match(main, /troubleshootingStore\.init\(\)/, 'app startup must restore troubleshooting sessions')
assert.ok(prompt.includes('Never ask the user to copy commands or paste output'))
assert.ok(prompt.includes('Empty output is not a disconnected session'))
assert.ok(aiChat.includes('MAX_AGENT_MODEL_ROUNDS'))
assert.ok(aiChat.includes('MAX_AGENT_ACTIONS'))
assert.ok(context.includes('MAX_AGENT_CONTEXT_TEXT = 24 * 1024'))
assert.ok(context.includes('MAX_AGENT_OPERATION_OUTPUT = 4 * 1024'))

console.log('AI Agent 2.0 wiring checks passed')
