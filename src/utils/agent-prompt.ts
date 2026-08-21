import type { AgentMode } from '@/stores/agent'
import { formatAgentContext, type AgentContextSnapshot } from './agent-context'

export interface AgentPromptInput {
  basePrompt: string
  locale: string
  mode: AgentMode
  context: AgentContextSnapshot | null
  canExecute: boolean
}

const EXECUTION_RULES = `你可以通过系统行动块在当前服务器执行命令。先使用有明确行数、时间或数量上限的只读命令采集证据，再判断根因。

命令格式：
<agent_action>{"id":"action-1","kind":"command","command":"journalctl -u nginx -n 80 --no-pager","purpose":"读取最近的 nginx 错误","verifyCommand":"systemctl is-active nginx"}</agent_action>

规则：
- 每个行动只包含一条逻辑命令；可以提出多个行动。
- 系统会独立判断权限。需要确认时只询问用户是否执行，不得尝试绕过。
- 收到真实执行结果后继续分析，不要重复已经成功并得到相同证据的命令。
- 变更操作必须给出安全的只读验证命令；验证失败时停止依赖步骤并重新判断。
- 命令成功但无输出不是断线。只有明确的通道错误才表示连接层异常。
- 不得让用户手动执行命令，不得要求用户“手动执行命令并把结果贴给你”，也不得让用户复制命令到终端。
- Empty output is not a disconnected session.
- Never ask the user to copy commands or paste output.
- 回复先给简短结论，再给关键证据和下一步；原始大段输出无需重复粘贴。`

const QA_RULES = `当前处于智能问答模式。不得输出 <agent_action> 或 <execute_command>，也不得直接执行服务器命令。可以提供解释和命令示例。`

export function buildAgentSystemPrompt(input: AgentPromptInput): string {
  const language = input.locale === 'zh-CN'
    ? '所有结论、证据、操作说明和错误信息必须使用简体中文。'
    : 'Respond in English.'
  const capability = input.canExecute && input.mode === 'agent' ? EXECUTION_RULES : QA_RULES
  const context = input.context
    ? formatAgentContext(input.context)
    : '=== 当前运维上下文（系统自动采集） ===\n主机：未连接\n=== 上下文结束 ==='
  // Older built-in agents contain the legacy execution protocol after this
  // heading. Keep their stable role/capabilities while avoiding conflicting
  // instructions now that action generation is centralized here.
  const legacyMarker = input.basePrompt.indexOf('## 工作方式')
  const stableBasePrompt = legacyMarker >= 0
    ? input.basePrompt.slice(0, legacyMarker).trim()
    : input.basePrompt
  return [language, stableBasePrompt, capability, context].join('\n\n')
}
