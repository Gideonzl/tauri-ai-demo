import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const aiChat = readFileSync(resolve(root, 'src/utils/ai-chat.ts'), 'utf8')
const aiPanel = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')
const diagnostics = readFileSync(resolve(root, 'src/utils/server-diagnostics.ts'), 'utf8')

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
  /onToolStart,\s*onAuthorizeCommand,\s*onCommandCompleted,\s*config/.test(streamLoopCall),
  'streamChat 必须把策略授权与审计回调继续传递到命令执行循环'
)

const toolExecution = aiChat.match(
  /const authorization = onAuthorizeCommand[\s\S]*?onToolStart\?\.\(tc\.command\)/
)?.[0] ?? ''
assert(
  /await onAuthorizeCommand\(tc\.command\)/.test(toolExecution) &&
    /!authorization\.allowed/.test(toolExecution),
  '每个命令都必须先经过策略授权，再由系统自动执行'
)

assert(
  aiChat.includes('让用户手动执行') &&
    aiChat.includes('手动执行命令并把结果贴给你'),
  '系统提示必须禁止把命令退回给用户手动执行'
)

assert(aiChat.includes('onAuthorizeCommand'), '工具循环必须使用策略授权回调')
assert(aiChat.includes('onCommandCompleted'), '工具循环必须回传执行结果以写入审计')
assert(aiPanel.includes('useOpsAgentStore'), '聊天面板必须使用运维权限 store')
assert(aiPanel.includes("decision.action === 'double_confirm'"), '高风险操作必须走二次确认分支')
assert(!diagnostics.includes("import { sshExec }"), '快捷诊断不得直接调用 sshExec')
assert(/runDiagnostics\s*\(\s*groupId\s*:\s*string\s*,\s*execute/.test(diagnostics), '快捷诊断必须接收已授权的执行器')
assert(aiPanel.includes('runAuthorizedDiagnostic'), '聊天面板必须为快捷诊断提供已授权执行器')
assert(aiPanel.includes('useRemediationStore'), '聊天面板必须使用自愈 store')
assert(aiPanel.includes('RemediationPlanCard'), '聊天面板必须展示自愈计划卡片')
assert(aiPanel.includes('createConservativeRemediationPlan'), '自愈必须通过本地计划生成器创建计划')
assert(aiPanel.includes('executeRemediationPlan'), '聊天面板必须提供计划执行函数')
assert(aiPanel.includes('shouldStopAfterStep'), '自愈失败后必须根据停止策略停止后续步骤')
assert(aiPanel.includes('runRemediationCommand(step, step.command)'), '自愈执行步骤必须通过统一授权执行器')
assert(aiPanel.includes('runRemediationCommand(step, step.verifyCommand, true)'), '自愈验证步骤也必须通过统一授权执行器')
assert(aiPanel.includes('await handleConfirmCommand(command)'), '自愈执行器必须复用统一授权回调')

console.log('Agent execution regression checks passed')
