import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const aiChat = readFileSync(resolve(root, 'src/utils/ai-chat.ts'), 'utf8')
const aiPanel = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')
const diagnostics = readFileSync(resolve(root, 'src/utils/server-diagnostics.ts'), 'utf8')
const agentStore = readFileSync(resolve(root, 'src/stores/agent.ts'), 'utf8')
const batchPanel = readFileSync(resolve(root, 'src/views/ops/BatchPanel.vue'), 'utf8')
const terminalPanel = readFileSync(resolve(root, 'src/components/TerminalPanel.vue'), 'utf8')
const sshProtocol = readFileSync(resolve(root, 'src-tauri/src/protocol/ssh/mod.rs'), 'utf8')

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Agent execution regression: ${message}`)
  }
}

const handleSend = aiPanel.match(
  /async function handleSend[\s\S]*?\n}\r?\n\r?\nfunction handleStop/
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
assert(aiPanel.includes('useOrchestrationStore'), '单机 AI 面板必须使用编排 store')
assert(aiPanel.includes('syncRemediationToOrchestration'), '单机自愈必须同步到编排任务模型')
assert(aiPanel.includes("taskType: 'remediation'"), '单机自愈编排任务类型必须是 remediation')
assert(agentStore.includes('自愈执行链'), '运维智能体提示必须说明自愈执行链')
assert(agentStore.includes('先采集证据，再生成修复计划'), '运维智能体必须先诊断再计划')
assert(agentStore.includes('每一步执行后必须验证'), '运维智能体必须要求执行后验证')
assert(agentStore.includes('不得让用户手动复制命令到终端'), '运维智能体不得把命令退回给用户手动执行')
assert(agentStore.includes('修复计划必须包含：现象、证据、命令、风险、验证命令、失败后是否停止'), '运维智能体必须要求结构化修复计划')
assert(agentStore.includes('高风险命令始终二次确认'), '运维智能体必须强调高风险命令的确认要求')
assert(batchPanel.includes('useOrchestrationStore'), '批量页必须使用编排 store')
assert(batchPanel.includes('createCommandTask'), '批量命令必须创建编排任务')
assert(batchPanel.includes('runWithConcurrency'), '批量执行必须使用并发限制器')
assert(batchPanel.includes('opsAgentStore.decide'), '批量命令必须复用权限策略')
assert(!batchPanel.includes('const DANGER ='), '批量页不得使用独立高危正则绕过统一权限策略')
assert(!batchPanel.includes('sshExec('), '批量页不得直接调用旧 sshExec 字符串接口')
assert(/channel\s*\.\s*request_pty\(true,\s*"xterm-256color"/.test(sshProtocol), '交互终端必须沿用已验证可用的 PTY 协商参数')
assert(sshProtocol.includes('async fn take_session_handle'), 'PTY 与命令通道必须协调共享 SSH handle')
assert(sshProtocol.includes('from_secs(15)'), 'PTY 等待共享 handle 的时间必须覆盖慢速命令通道启动')
assert(sshProtocol.includes('SSH session stayed busy while opening another channel'), '共享 handle 被占用时必须等待而非误报连接失败')
assert(sshProtocol.includes('restore_session_handle(session_id, handle).await?'), '使用 SSH handle 后必须归还到会话池')
assert(terminalPanel.includes('formatPtyError'), 'PTY 错误必须格式化为可读文本')
assert(!terminalPanel.includes('PTY failed: ${e}'), 'PTY 错误不能显示为 [object Object]')
assert(terminalPanel.includes('must never silently fall back to the local demo shell'), '真实 SSH PTY 失败时不得静默切到模拟终端')
assert(terminalPanel.includes('function wireSessionStreams'), '终端必须在启动 SSH Shell 前建立输出订阅')
assert(terminalPanel.includes('wireSessionStreams(s)') && terminalPanel.indexOf('wireSessionStreams(s)') < terminalPanel.indexOf('await s.start()'), 'SSH 首个提示符不能在订阅建立前丢失')
assert(terminalPanel.includes("s.sendInput('\\r')"), 'SSH Shell 成功后必须自动发送回车以显示提示符')

console.log('Agent execution regression checks passed')
