# 运维智能体权限与诊断 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为运维智能体提供不可绕过的前端命令策略、四级权限控制、可脱敏审计记录和受策略保护的诊断工作流。

**Architecture:** 新增纯 TypeScript 策略模块，先将每条命令分类为只读、变更、高风险或未知，再依据当前权限档位与自定义规则生成允许、确认、二次确认或拒绝的决定。Pinia store 负责持久化权限、规则与有限期审计；`AiChat` 只调用统一授权回调，聊天工具调用和快捷诊断都不得直接绕过该回调。

**Tech Stack:** Vue 3、TypeScript strict mode、Pinia、Element Plus、Tauri SSH invoke、Node.js 内置测试脚本、Vite、Cargo。

## Global Constraints

- 默认权限必须是 `controlled`；`readonly` 绝不能运行变更、高风险或未知命令。
- 内在高风险命令永远不允许自动执行，即使存在自定义规则。
- 用户只确认是否执行；确认后系统通过既有 SSH 通道自动执行，绝不要求用户手动运行命令。
- 审计输出只能保存脱敏、截断的摘要，不能保存完整命令输出。
- 快捷诊断和模型输出的工具命令都必须经过同一策略引擎。
- 每个任务完成后运行对应回归检查；最终必须运行前端构建、Rust 检查和桌面实际启动检查。

---

## File Structure

- Create `src/utils/ops-permission.ts` — 纯策略函数与类型；不依赖 Vue、Pinia 或 SSH。
- Create `src/stores/opsAgent.ts` — 当前权限、自定义规则、审计事件和本地持久化。
- Create `src/components/OpsPermissionControl.vue` — 运维智能体顶部的权限档位按钮与说明弹窗。
- Create `src/components/OpsAuditDrawer.vue` — 近期审计抽屉，只展示脱敏摘要。
- Modify `src/utils/ai-chat.ts` — 把布尔确认回调替换为统一授权和执行结果钩子，增强运维工作流提示。
- Modify `src/utils/server-diagnostics.ts` — 使用注入的、已授权的执行器，删除快捷诊断对 SSH 的直连。
- Modify `src/components/AiChat.vue` — 接入权限控制、双重确认、审计和已授权快捷诊断。
- Modify `src/i18n/zh-CN.json` and `src/i18n/en.json` — 补齐权限、风险、审计与诊断文案。
- Modify `scripts/verify-agent-execution.mjs` — 断言聊天和快捷诊断不会绕过授权。
- Create `scripts/verify-ops-permissions.mjs` — 编译并执行真实 `ops-permission.ts` 导出的策略测试。
- Modify `package.json` — 添加 `test:ops-permissions` 脚本。

### Task 1: 建立可测试的命令策略引擎

**Files:**
- Create: `src/utils/ops-permission.ts`
- Create: `scripts/verify-ops-permissions.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `classifyCommand(command: string): CommandClassification`。
- Produces `evaluateCommand(classification, level, rules): PermissionDecision`。
- Produces `PermissionLevel`, `CommandRisk`, `CustomPermissionRule`, `PermissionDecision`，供 store 和 UI 复用。

- [ ] **Step 1: 写入会失败的真实策略测试**

在 `scripts/verify-ops-permissions.mjs` 中使用项目已有的 `typescript` 包把 `src/utils/ops-permission.ts` 转译为 CommonJS，并从 `module.exports` 调用真实导出：

```js
assert.equal(classifyCommand('df -h').risk, 'read_only')
assert.equal(classifyCommand('systemctl restart nginx').risk, 'change')
assert.equal(classifyCommand('rm -rf /var/tmp/cache').risk, 'high_risk')
assert.equal(evaluateCommand(classifyCommand('df -h'), 'readonly', []).action, 'allow')
assert.equal(evaluateCommand(classifyCommand('systemctl restart nginx'), 'readonly', []).action, 'deny')
assert.equal(evaluateCommand(classifyCommand('systemctl restart nginx'), 'controlled', []).action, 'confirm')
assert.equal(evaluateCommand(classifyCommand('rm -rf /var/tmp/cache'), 'elevated', []).action, 'double_confirm')
```

测试脚本在转译前删除旧临时目录，在系统临时目录写入单个编译文件，执行完成后使用 `finally` 删除该文件；不要向仓库写入编译产物。

- [ ] **Step 2: 运行测试，确认它因为模块不存在而失败**

Run: `node scripts/verify-ops-permissions.mjs`
Expected: 退出码非 0，错误包含 `ops-permission.ts` 或 `ENOENT`。

- [ ] **Step 3: 实现最小策略模块**

在 `src/utils/ops-permission.ts` 中实现以下接口和固定高风险优先级：

```ts
export type PermissionLevel = 'readonly' | 'controlled' | 'elevated' | 'custom'
export type CommandRisk = 'read_only' | 'change' | 'high_risk' | 'unknown'
export type PermissionAction = 'allow' | 'confirm' | 'double_confirm' | 'deny'

export interface CommandClassification {
  command: string
  risk: CommandRisk
  reason: string
}
export interface CustomPermissionRule {
  id: string
  pattern: string
  action: Exclude<PermissionAction, 'double_confirm'>
  hostIds: string[]
  enabled: boolean
}
export interface PermissionDecision extends CommandClassification {
  action: PermissionAction
  source: 'builtin' | 'custom'
}
```

`classifyCommand` 先匹配 `rm -rf`、`mkfs`、`dd ... of=`、分区工具、递归 `chmod/chown`、用户删除、关机/重启、原始磁盘写入、清空防火墙、`drop database` 等高风险模式；再匹配 `systemctl restart/start/stop/reload`、`docker` 变更、包管理、重定向写文件、`sed -i`、`tee`、`chmod/chown` 等变更模式；仅在整条 shell 链中没有任何变更/高风险成分时把 `df`、`free`、`uptime`、`ps`、`ss`、`journalctl`、`systemctl status`、`cat`、`grep`、`find`、`du` 等归为只读。所有其他命令为 `unknown`。

`evaluateCommand` 必须在读取自定义规则前处理 `high_risk` 并无条件返回 `double_confirm`；只读档位只允许 `read_only`；受控档位允许只读、确认变更/未知；高权限档位允许只读、确认变更/未知；自定义档位按启用且主机匹配的最具体规则处理，未命中时回退受控档位规则。

- [ ] **Step 4: 运行策略测试并执行 TypeScript 检查**

Run: `node scripts/verify-ops-permissions.mjs; npx vue-tsc --noEmit`
Expected: 策略脚本打印 `Ops permission policy checks passed`，类型检查退出码为 0。

- [ ] **Step 5: 提交策略层**

```bash
git add src/utils/ops-permission.ts scripts/verify-ops-permissions.mjs package.json
git commit -m "feat: add ops command permission policy"
```

### Task 2: 持久化权限状态与脱敏审计

**Files:**
- Create: `src/stores/opsAgent.ts`
- Modify: `scripts/verify-ops-permissions.mjs`

**Interfaces:**
- Consumes `PermissionLevel`, `PermissionDecision`, `CustomPermissionRule`。
- Produces `useOpsAgentStore()`，其中包含 `permissionLevel`、`rules`、`auditEvents`、`decide()`、`recordAudit()` 和 `completeAudit()`。

- [ ] **Step 1: 扩展失败测试以覆盖审计摘要**

在策略验证脚本中读取 store 源码，断言存在 `MAX_AUDIT_EVENTS = 200`、`AUDIT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000`，并断言 `summarizeOutput` 使用 `replace` 脱敏 `password|token|secret|authorization` 键值且将内容截断到 500 个字符。

- [ ] **Step 2: 运行测试，确认新增 store 断言失败**

Run: `node scripts/verify-ops-permissions.mjs`
Expected: 退出码非 0，错误说明 `opsAgent.ts` 尚不存在或缺少审计约束。

- [ ] **Step 3: 实现 Pinia 运维智能体 store**

在 `src/stores/opsAgent.ts` 中定义：

```ts
export interface AuditEvent {
  id: string
  createdAt: number
  hostId: string
  hostName: string
  command: string
  decision: PermissionDecision
  approved: boolean | null
  status: 'pending' | 'denied' | 'completed' | 'failed'
  outputSummary: string
}
```

使用 `ops-agent-permission`, `ops-agent-rules`, `ops-agent-audit` 三个 localStorage 键。`decide(command, hostId)` 调用 `evaluateCommand`；`recordAudit` 创建 pending 或 denied 事件；`completeAudit(id, result)` 仅保存 `summarizeOutput(result)`；加载与每次写入时清除 90 天前事件并只保留最新 200 条。localStorage 解析失败时回退到 `controlled`、空规则和空审计，不能抛出错误。

- [ ] **Step 4: 重新运行策略与类型验证**

Run: `node scripts/verify-ops-permissions.mjs; npx vue-tsc --noEmit`
Expected: 两项退出码均为 0。

- [ ] **Step 5: 提交权限状态层**

```bash
git add src/stores/opsAgent.ts scripts/verify-ops-permissions.mjs
git commit -m "feat: persist ops permissions and audit events"
```

### Task 3: 将聊天工具调用接入统一授权、二次确认与审计

**Files:**
- Modify: `src/utils/ai-chat.ts`
- Modify: `src/components/AiChat.vue`
- Create: `src/components/OpsPermissionControl.vue`
- Create: `src/components/OpsAuditDrawer.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- `streamChat` 接收 `onAuthorizeCommand(command): Promise<CommandAuthorization>` 和 `onCommandCompleted(command, result): void`。
- `CommandAuthorization` 固定为 `{ allowed: boolean; auditId?: string; denialMessage: string }`。
- `OpsPermissionControl` 通过 `v-model:level` 修改 `PermissionLevel`；`OpsAuditDrawer` 只接收 `AuditEvent[]`。

- [ ] **Step 1: 给现有回归脚本增加失败断言**

在 `scripts/verify-agent-execution.mjs` 中断言：

```js
assert(aiChat.includes('onAuthorizeCommand'), '工具循环必须使用策略授权回调')
assert(aiChat.includes('onCommandCompleted'), '工具循环必须回传执行结果以写入审计')
assert(aiPanel.includes('useOpsAgentStore'), '聊天面板必须使用运维权限 store')
assert(aiPanel.includes('double_confirm'), '高风险操作必须走二次确认分支')
assert(!serverDiagnosticsDirectExec, '快捷诊断不得直接调用 sshExec')
```

- [ ] **Step 2: 运行回归脚本，确认新断言失败**

Run: `npm run test:agent-execution`
Expected: 退出码非 0，错误说明当前工具循环尚未使用策略授权回调。

- [ ] **Step 3: 实现统一授权回调和 UI**

将 `ai-chat.ts` 中的 `onConfirmCommand` 改为：

```ts
export interface CommandAuthorization {
  allowed: boolean
  auditId?: string
  denialMessage: string
}

onAuthorizeCommand?: (command: string) => Promise<CommandAuthorization>
onCommandCompleted?: (command: string, result: string, authorization: CommandAuthorization) => void
```

在工具循环中，先调用 `onAuthorizeCommand`；拒绝时把 `denialMessage` 作为模型上下文且不执行 SSH；允许后执行既有 `executeCommand` 与一次连接级重试，随后调用 `onCommandCompleted`。没有回调时默认拒绝，防止未来调用点绕过策略。

`AiChat.vue` 中实现 `authorizeAgentCommand`：从 `opsAgentStore.decide(command, activeServerId)` 获得决定、先写入审计；`allow` 直接通过；`confirm` 显示一次 Element Plus 确认框；`double_confirm` 先显示风险和影响说明，再显示“仍要执行 / 取消”的第二个确认框；`deny` 立即写入拒绝审计并返回明确原因。确认通过后直接让工具循环执行，不显示任何需要用户复制的终端命令。

在 `OpsPermissionControl.vue` 使用盾牌图标、当前档位胶囊按钮和 `el-dialog` 展示四个固定档位；在 `OpsAuditDrawer.vue` 用 `el-drawer` 展示时间、主机、风险、决策、状态和 `outputSummary`，不渲染完整输出。只在当前智能体为 `ops` 时显示这两个组件。

- [ ] **Step 4: 补齐双语文案并运行回归**

为 `ai` 命名空间添加 `permission`, `permissionReadonly`, `permissionControlled`, `permissionElevated`, `permissionCustom`, `riskReadOnly`, `riskChange`, `riskHigh`, `riskUnknown`, `audit`, `auditEmpty`, `confirmChange`, `confirmHighRisk`, `confirmHighRiskAgain`, `commandBlocked` 等中英文键。

Run: `npm run test:agent-execution; node scripts/verify-ops-permissions.mjs; npx vue-tsc --noEmit`
Expected: 三项均退出码 0。

- [ ] **Step 5: 提交聊天安全接入**

```bash
git add src/utils/ai-chat.ts src/components/AiChat.vue src/components/OpsPermissionControl.vue src/components/OpsAuditDrawer.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-agent-execution.mjs
git commit -m "feat: enforce ops agent permissions in chat"
```

### Task 4: 让快捷诊断复用授权，并强化运维工作流

**Files:**
- Modify: `src/utils/server-diagnostics.ts`
- Modify: `src/components/AiChat.vue`
- Modify: `src/stores/agent.ts`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- `runDiagnostics(groupId, execute, onProgress?)` 接受 `execute(command: DiagnosticCommand): Promise<string>`，不再接收或使用 SSH session。
- `AiChat` 的 `runAuthorizedDiagnostic` 复用 Task 3 的授权与审计逻辑。

- [ ] **Step 1: 加入会失败的快捷诊断安全断言**

在 `scripts/verify-agent-execution.mjs` 读取 `server-diagnostics.ts`，断言其不包含 `import { sshExec }`，且 `runDiagnostics` 参数包含 `execute`；读取 `AiChat.vue`，断言存在 `runAuthorizedDiagnostic` 和 `runDiagnostics(groupId, runAuthorizedDiagnostic`。

- [ ] **Step 2: 运行回归脚本，确认断言失败**

Run: `npm run test:agent-execution`
Expected: 退出码非 0，错误说明快捷诊断仍直接导入 SSH API。

- [ ] **Step 3: 改造快捷诊断和运维提示**

将 `runDiagnostics` 改为：

```ts
export async function runDiagnostics(
  groupId: string,
  execute: (command: DiagnosticCommand) => Promise<string>,
  onProgress?: (label: string) => void,
): Promise<string> {
  const group = DIAGNOSTIC_GROUPS[groupId]
  if (!group) return ''
  const results = []
  for (const command of group.commands) {
    onProgress?.(command.label)
    results.push(await execute(command))
  }
  return results.join('\n\n')
}
```

在 `AiChat.vue` 中以 `runAuthorizedDiagnostic` 适配器执行每条诊断命令：调用 `authorizeAgentCommand`、拒绝时返回 `[策略已阻止] 原因`、允许时通过 `sshExecFull` 运行、使用既有结构化结果格式化并调用 `completeAudit`。不得调用旧 `sshExec`。

更新 `agent.ts` 的运维系统提示，要求模型依次执行“建立上下文 → 有界只读采集 → 关联证据 → 给出风险排序计划 → 获批后执行变更 → 自动验证”，并明确未知命令和高风险命令由策略系统裁决，不能通过提示词要求绕过。

- [ ] **Step 4: 运行全部前端回归检查**

Run: `npm run test:agent-execution; node scripts/verify-ops-permissions.mjs; npm run build; cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 全部退出码为 0；Vite 仅允许已有的依赖注释与 bundle 大小警告，不允许 TypeScript、Vue 或 Rust 错误。

- [ ] **Step 5: 提交智能诊断工作流**

```bash
git add src/utils/server-diagnostics.ts src/components/AiChat.vue src/stores/agent.ts scripts/verify-agent-execution.mjs
git commit -m "feat: route diagnostics through ops policy"
```

### Task 5: 最终启动验证与交付说明

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-ops-agent-permissions-design.md`（仅将状态改为“已实施”，不改动需求）

**Interfaces:**
- Consumes Tasks 1–4 的真实策略、审计和授权入口。
- Produces 可复现的验证记录与更新后的规格状态。

- [ ] **Step 1: 运行完整验证集**

Run:

```powershell
npm run test:agent-execution
node scripts/verify-ops-permissions.mjs
npm run build
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: 四项命令均退出码 0。

- [ ] **Step 2: 执行桌面启动检查**

在没有既有 1420 监听端口或 `aiterminal` 进程时，启动 `npm run tauri -- dev`；等待 Vite 就绪和 `target\debug\aiterminal.exe` 运行日志，或直接启动新构建的 `src-tauri/target/debug/aiterminal.exe` 并确认其在 5 秒后未提前退出。检查结束后仅关闭本次检查启动的任务，并确认没有残留端口和进程。

- [ ] **Step 3: 更新规格状态并复查工作区**

将规格首部的状态改为 `已实施，已验证`。

Run: `git diff --check; git status --short`
Expected: 无空白错误；只包含规格状态更新。

- [ ] **Step 4: 提交最终验证状态**

```bash
git add docs/superpowers/specs/2026-07-29-ops-agent-permissions-design.md
git commit -m "docs: record ops agent permission verification"
```

## Plan Self-Review

- **Spec coverage:** Task 1 覆盖四级决策与高风险优先；Task 2 覆盖审计持久化、脱敏和滚动保留；Task 3 覆盖权限按钮、确认与工具调用；Task 4 覆盖关联式诊断和快捷诊断不绕过策略；Task 5 覆盖构建、Rust 和桌面启动验证。
- **Placeholder scan:** 本计划没有未完成占位文本；后续自愈和多机编排属于已明确排除的下一阶段。
- **Type consistency:** 所有 UI 与聊天入口统一使用 `PermissionLevel`、`PermissionDecision`、`CommandAuthorization` 和 `AuditEvent`；诊断通过 `execute(DiagnosticCommand)` 回调而非 SSH 直连。
