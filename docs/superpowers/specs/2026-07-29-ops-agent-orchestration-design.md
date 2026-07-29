# 运维智能体：多机编排设计

**日期：** 2026-07-29
**状态：** 已设计，待实施

## 目标

在现有权限控制、自愈执行链和审计能力之上，为运维智能体增加统一的编排层，让它既能处理单个主机，也能处理多台主机的批量任务。用户可以对一台主机发起诊断、修复和验证，也可以对多台主机发起巡检、命令分发和灰度式修复；所有命令都必须经过同一权限策略和审计链。

用户不需要手工复制命令到终端。单机和批量编排都应通过软件自动执行，必要时只让用户确认是否执行。

## 范围

本阶段覆盖两类入口：

- **单机编排**：当前 SSH 会话上的诊断、自愈和验证，复用现有 AI 智能体和自愈计划。
- **批量编排**：在“智能运维 → 批量”页对多台主机执行巡检、只读命令、受控变更和修复计划。

本阶段不做：

- 定时任务
- 后台无人值守自动巡检
- 跨账号或密钥分发
- 自动回滚到历史版本
- 真正的集群编排控制平面

## 方案选择

采用“共享编排核心 + 单机入口 + 批量入口”。

- 不采用把单机和批量拆成两套逻辑，因为权限、审计、失败停止和结果汇总会重复实现。
- 不采用新开独立编排页，因为现有“智能运维 → 批量”页已经具备多主机入口和结果区，继续复用最稳。
- 推荐方案是在一套统一任务模型上，按目标数量区分单机和批量，前端只负责展示和触发，执行、权限和审计都走共享核心。

## 编排工作流

### 单机编排

1. 用户在右侧 AI 智能体中描述问题，或直接点击“自愈检查”。
2. 系统先采集当前主机证据，再生成一个包含多个步骤的编排计划。
3. 计划中的每一步都要经过现有权限策略。
4. 每步执行后自动验证；失败则停止后续步骤，并把失败输出交给智能体重新分析。

### 批量编排

1. 用户在批量页选择多台主机，选择任务类型：巡检、只读命令、受控命令、修复计划。
2. 系统先按主机生成目标清单，再按并发上限分批执行。
3. 每个目标主机都独立记录状态、审计和输出摘要。
4. 批量任务默认“某台主机失败后，不影响已完成主机，但停止后续同类变更批次”。
5. 汇总区按主机展示结果，支持复制汇总文本。

## 任务模型

新增统一编排模型，尽量复用已有自愈步骤和权限决策。

```ts
export type OrchestrationMode = 'single' | 'batch'
export type OrchestrationTaskType = 'inspection' | 'command' | 'remediation'
export type OrchestrationTaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'stopped'

export interface OrchestrationTarget {
  hostId: string
  hostName: string
  hostAddress: string
  sessionId?: string
  status: 'pending' | 'connecting' | 'running' | 'completed' | 'failed' | 'skipped'
  summary?: string
  error?: string
}

export interface OrchestrationStep {
  id: string
  title: string
  command: string
  verifyCommand?: string
  risk: CommandRisk
  stopOnFailure: boolean
  status: 'pending' | 'waiting_approval' | 'running' | 'verifying' | 'completed' | 'failed' | 'skipped'
  auditId?: string
  outputSummary?: string
  verificationSummary?: string
}

export interface OrchestrationTask {
  id: string
  mode: OrchestrationMode
  taskType: OrchestrationTaskType
  title: string
  concurrency: number
  targets: OrchestrationTarget[]
  steps: OrchestrationStep[]
  status: OrchestrationTaskStatus
  createdAt: number
}
```

`OrchestrationTask` 是编排层的统一入口。单机任务只有一个 `target`，批量任务包含多个 `target`，但两者都使用同一套执行和审计规则。

## UI 与入口

现有界面保持为主，不新增新的顶级导航。

- 右侧 AI 智能体保留单机编排入口，直接服务当前 SSH 主机。
- “智能运维 → 批量”页升级为多机编排中心，继续承接多台主机选择、任务类型、并发数和结果汇总。
- 任务执行时展示统一的编排卡片，卡片上按主机分组显示状态、风险标签、命令、验证和输出摘要。
- 批量页顶部增加并发控制，默认 `2`，最小 `1`，只读任务可适当提高并发，受控变更和修复任务默认保持保守。

## 安全边界

- 每台主机、每个步骤都必须走现有命令权限策略。
- 不能通过批量任务直接调用 SSH。
- 高风险命令始终二次确认，自定义规则也不能把高风险降为自动执行。
- 单机和批量都必须写审计记录，且只保存脱敏摘要。
- 批量变更默认失败即停止后续批次，但不回滚已完成主机。
- 变更与修复步骤必须带验证命令；没有验证命令的步骤不得进入可执行计划。
- 当计划解析失败或目标状态不完整时，只能降级为说明性输出，不能自动执行。

## 错误处理

- **单台主机连接失败**：标记该主机失败，继续其他主机。
- **权限拒绝**：标记该步骤或主机为跳过，按任务策略决定是否停止后续批次。
- **命令超时**：记录为失败或部分完成，不把无输出误判为断线。
- **验证失败**：标记该步骤失败，并停止该主机后续步骤。
- **批次失败阈值触发**：当连续失败达到预设阈值时停止剩余批次，避免扩大影响。
- **计划格式不合法**：不执行命令，仅返回结构化错误说明。

## 数据流

1. 用户在单机 AI 面板或批量页发起任务。
2. 编排核心根据目标数量和任务类型生成任务与步骤。
3. 执行器逐主机取得 session，再逐步骤调用现有授权回调。
4. 每步执行后写入输出摘要和验证摘要。
5. 编排汇总器把各主机状态聚合成可复制、可查看的结果。

## 测试与验证标准

- 任务模型必须可被单元测试直接构造和校验。
- 单机与批量都必须经过同一权限决策函数。
- 批量执行不得直接引用原始 `sshExec`，只能通过授权执行器。
- 失败停止策略必须可回归验证：一个主机失败不能拖垮已完成主机，但后续同类批次必须停止。
- 运行现有 `test:agent-execution`、`test:ops-permissions`、`test:ops-remediation`、前端构建、Rust 检查，并实际启动桌面应用检查启动错误。

## 后续扩展

未来如果要做真正的集群编排，只需在 `OrchestrationTask` 上扩展更多任务类型和策略，不需要推翻本阶段的单机/批量结构。

## 设计自审

- 本设计同时覆盖单机和批量，没有把它们拆成两套孤立逻辑。
- 任务模型足够统一，能直接承接现有自愈计划。
- 所有执行入口都受现有权限、审计和验证约束，没有新的绕过路径。
- 本阶段不包含定时任务和无人值守自动执行，范围清晰。
