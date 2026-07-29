import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const aiChat = readFileSync(resolve(root, 'src/utils/ai-chat.ts'), 'utf8')
const aiPanel = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Agent execution regression: ${message}`)
  }
}

const handleSend = aiPanel.match(
  /async function handleSend\(\)[\s\S]*?\n}\r?\n\r?\nfunction handleStop/
)?.[0] ?? ''
assert(
  /agentStore\.activeMode,\s*handleConfirmCommand/.test(handleSend),
  '普通聊天入口必须把确认回调传给 streamChat'
)

const streamLoopCall = aiChat.match(
  /await runConversationLoop\([\s\S]*?activeAbort\s*\)/
)?.[0] ?? ''
assert(
  /onToolStart,\s*onConfirmCommand,\s*config/.test(streamLoopCall),
  'streamChat 必须把确认回调继续传递到命令执行循环'
)

const toolExecution = aiChat.match(
  /\/\/ Ask once for permission[\s\S]*?onToolStart\?\.\(tc\.command\)/
)?.[0] ?? ''
assert(
  /if \(onConfirmCommand\)/.test(toolExecution) &&
    /await onConfirmCommand\(tc\.command\)/.test(toolExecution),
  '每个命令都必须先经过用户确认，再由系统自动执行'
)

assert(
  aiChat.includes('让用户手动执行') &&
    aiChat.includes('手动执行命令并把结果贴给你'),
  '系统提示必须禁止把命令退回给用户手动执行'
)

console.log('Agent execution regression checks passed')
