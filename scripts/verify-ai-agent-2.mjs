import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const ai = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')
const settings = readFileSync(resolve(root, 'src/views/SettingsView.vue'), 'utf8')
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')

assert.match(ai, /buildAgentContext\s*\(/, 'AI send must build a bounded context snapshot')
assert.match(ai, /troubleshootingStore\.startOrResume/, 'AI chat must start or resume the conversation task')
assert.match(ai, /troubleshootingStore\.setState/, 'stream state must persist in the task store')
assert.match(ai, /operationRecordsStore\.addRecord/, 'AI commands must create unified operation records')
assert.match(ai, /troubleshootingStore\.addEvidence/, 'operation records must attach to the active task')
assert.ok(settings.includes("'ai-troubleshooting-sessions-v1'"), 'AI/history data category must own troubleshooting sessions')
assert.match(settings, /troubleshootingStore\.clearAll\(\)/, 'data clearing must reset the in-memory task store')
assert.match(main, /troubleshootingStore\.init\(\)/, 'app startup must restore troubleshooting sessions')

console.log('AI Agent 2.0 wiring checks passed')
