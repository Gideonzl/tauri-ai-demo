# 运维智能体多机编排 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为运维智能体增加共享编排核心，让单机和批量任务都能按权限、审计、并发和失败策略安全执行。

**Architecture:** 新增纯 TypeScript 编排核心，负责任务模型、校验、并发调度和失败停止决策；批量页复用该核心执行巡检和命令，右侧 AI 自愈入口逐步接入同一模型。执行层继续通过现有授权回调和 SSH 会话解析，不允许批量任务绕过权限策略。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Tauri SSH invoke、Node.js 回归脚本、Vite、Cargo。

## Global Constraints

- 每台主机、每个步骤都必须走现有命令权限策略。
- 不能通过批量任务直接调用 SSH。
- 高风险命令始终二次确认，自定义规则也不能把高风险降为自动执行。
- 单机和批量都必须写审计记录，且只保存脱敏摘要。
- 批量变更默认失败即停止后续批次，但不回滚已完成主机。
- 变更与修复步骤必须带验证命令；没有验证命令的步骤不得进入可执行计划。
- 本阶段不做定时任务和无人值守自动执行。
- 每个开发完成点都必须运行相关回归检查；最终必须实际启动桌面应用检查启动错误。

---

## File Structure

- Create `src/utils/ops-orchestration.ts` — 纯编排领域模型、任务校验、并发调度、失败停止和汇总函数；不依赖 Vue、Pinia 或 SSH。
- Create `src/stores/orchestration.ts` — 当前编排任务、目标状态、步骤输出摘要和运行状态。
- Create `src/components/OrchestrationTaskCard.vue` — 单机/批量通用编排卡片，展示目标主机、步骤、风险、状态和摘要。
- Modify `src/views/ops/BatchPanel.vue` — 升级现有批量页，增加并发控制，使用编排 store 和核心调度。
- Modify `src/components/AiChat.vue` — 单机自愈计划同步生成一个单目标编排任务，保留现有自愈卡片，逐步共享状态模型。
- Modify `src/i18n/zh-CN.json` and `src/i18n/en.json` — 增加编排、并发、失败策略、目标状态文案。
- Modify `scripts/verify-agent-execution.mjs` — 断言单机和批量编排不绕过授权。
- Create `scripts/verify-ops-orchestration.mjs` — 编译真实编排模块并测试任务校验、并发上限、失败停止和汇总。
- Modify `package.json` — 添加 `test:ops-orchestration` 脚本。
- Modify `docs/superpowers/specs/2026-07-29-ops-agent-orchestration-design.md` — 最终把状态改为“已实施，已验证”。

### Task 1: 建立纯编排核心和回归测试

**Files:**
- Create: `src/utils/ops-orchestration.ts`
- Create: `scripts/verify-ops-orchestration.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CommandRisk`, `classifyCommand` from `src/utils/ops-permission.ts`
- Produces:
  - `OrchestrationMode`
  - `OrchestrationTaskType`
  - `OrchestrationTaskStatus`
  - `OrchestrationTarget`
  - `OrchestrationStep`
  - `OrchestrationTask`
  - `createCommandTask(input)`
  - `validateOrchestrationTask(task)`
  - `runWithConcurrency(items, limit, worker)`
  - `shouldStopRemaining(task, failedStepOrTarget)`
  - `summarizeOrchestration(task)`

- [ ] **Step 1: 写入会失败的真实编排测试**

Create `scripts/verify-ops-orchestration.mjs`:

```js
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-orchestration.ts')
assert.ok(existsSync(sourcePath), 'ops-orchestration.ts must exist')

function compile(source, modulePath) {
  return ts.transpileModule(source, {
    fileName: modulePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    },
  }).outputText
}

const policyPath = resolve(root, 'src/utils/ops-permission.ts')
const policyModule = { exports: {} }
new Function('exports', 'module', compile(readFileSync(policyPath, 'utf8'), policyPath))(policyModule.exports, policyModule)

const orchestrationModule = { exports: {} }
new Function('exports', 'module', 'require', compile(readFileSync(sourcePath, 'utf8'), sourcePath))(
  orchestrationModule.exports,
  orchestrationModule,
  (id) => {
    if (id === '@/utils/ops-permission') return policyModule.exports
    throw new Error(`Unexpected import: ${id}`)
  },
)

const orchestration = orchestrationModule.exports

const targets = [
  { hostId: 'h1', hostName: 'web-1', hostAddress: 'root@10.0.0.1' },
  { hostId: 'h2', hostName: 'web-2', hostAddress: 'root@10.0.0.2' },
  { hostId: 'h3', hostName: 'web-3', hostAddress: 'root@10.0.0.3' },
]

const commandTask = orchestration.createCommandTask({
  mode: 'batch',
  title: 'Batch disk check',
  command: 'df -h',
  targets,
  concurrency: 2,
})

assert.equal(commandTask.mode, 'batch')
assert.equal(commandTask.taskType, 'command')
assert.equal(commandTask.concurrency, 2)
assert.equal(commandTask.targets.length, 3)
assert.equal(commandTask.steps[0].risk, 'read_only')
assert.equal(orchestration.validateOrchestrationTask(commandTask).valid, true)

const invalidChange = orchestration.createCommandTask({
  mode: 'batch',
  title: 'Restart without verify',
  command: 'systemctl restart nginx',
  targets,
  concurrency: 2,
})
assert.equal(orchestration.validateOrchestrationTask(invalidChange).valid, false)
assert.match(orchestration.validateOrchestrationTask(invalidChange).errors.join('\\n'), /verifyCommand/)

let active = 0
let maxActive = 0
const ordered = await orchestration.runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
  active += 1
  maxActive = Math.max(maxActive, active)
  await new Promise(resolve => setTimeout(resolve, 5))
  active -= 1
  return item * 10
})
assert.deepEqual(ordered, [10, 20, 30, 40])
assert.equal(maxActive <= 2, true)

const failedTask = {
  ...commandTask,
  targets: commandTask.targets.map((target, index) => ({ ...target, status: index === 0 ? 'failed' : 'pending' })),
}
assert.equal(orchestration.shouldStopRemaining(failedTask, failedTask.targets[0]), false)

const changeTask = {
  ...commandTask,
  taskType: 'command',
  steps: [{ ...commandTask.steps[0], risk: 'change', verifyCommand: 'systemctl is-active nginx', stopOnFailure: true, status: 'failed' }],
}
assert.equal(orchestration.shouldStopRemaining(changeTask, changeTask.steps[0]), true)

const summary = orchestration.summarizeOrchestration({
  ...commandTask,
  targets: commandTask.targets.map((target, index) => ({ ...target, status: index === 1 ? 'failed' : 'completed', summary: index === 1 ? 'boom' : 'ok' })),
})
assert.match(summary, /web-1/)
assert.match(summary, /web-2/)
assert.match(summary, /boom/)

console.log('Ops orchestration checks passed')
```

- [ ] **Step 2: 添加 package 脚本并确认测试失败**

Modify `package.json` scripts:

```json
"test:ops-orchestration": "node scripts/verify-ops-orchestration.mjs"
```

Run: `npm run test:ops-orchestration`
Expected: 退出码非 0，错误包含 `ops-orchestration.ts must exist`。

- [ ] **Step 3: 实现最小编排核心**

Create `src/utils/ops-orchestration.ts`:

```ts
import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type OrchestrationMode = 'single' | 'batch'
export type OrchestrationTaskType = 'inspection' | 'command' | 'remediation'
export type OrchestrationTaskStatus = 'draft' | 'queued' | 'running' | 'verifying' | 'completed' | 'failed' | 'stopped'
export type OrchestrationTargetStatus = 'pending' | 'connecting' | 'running' | 'completed' | 'failed' | 'skipped'
export type OrchestrationStepStatus = 'pending' | 'waiting_approval' | 'running' | 'verifying' | 'completed' | 'failed' | 'skipped'

export interface OrchestrationTargetInput {
  hostId: string
  hostName: string
  hostAddress: string
  sessionId?: string
}

export interface OrchestrationTarget extends OrchestrationTargetInput {
  status: OrchestrationTargetStatus
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
  status: OrchestrationStepStatus
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

export interface CreateCommandTaskInput {
  mode: OrchestrationMode
  title: string
  command: string
  verifyCommand?: string
  targets: OrchestrationTargetInput[]
  concurrency?: number
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clampConcurrency(value: number | undefined, targetCount: number): number {
  const fallback = 2
  const raw = Number.isFinite(value) ? Number(value) : fallback
  return Math.max(1, Math.min(Math.floor(raw), Math.max(1, targetCount)))
}

export function createCommandTask(input: CreateCommandTaskInput): OrchestrationTask {
  const risk = classifyCommand(input.command).risk
  return {
    id: createId('ops-orchestration'),
    mode: input.mode,
    taskType: 'command',
    title: input.title,
    concurrency: clampConcurrency(input.concurrency, input.targets.length),
    targets: input.targets.map(target => ({ ...target, status: 'pending' })),
    steps: [{
      id: 'command-main',
      title: input.title,
      command: input.command,
      verifyCommand: input.verifyCommand,
      risk,
      stopOnFailure: risk !== 'read_only',
      status: 'pending',
    }],
    status: 'queued',
    createdAt: Date.now(),
  }
}

export function validateOrchestrationTask(task: OrchestrationTask): ValidationResult {
  const errors: string[] = []
  if (!task.id) errors.push('task.id is required')
  if (!task.title?.trim()) errors.push('title is required')
  if (!Array.isArray(task.targets) || task.targets.length === 0) errors.push('targets must contain at least one host')
  if (!Array.isArray(task.steps) || task.steps.length === 0) errors.push('steps must contain at least one step')
  if (task.concurrency < 1) errors.push('concurrency must be at least 1')
  if (task.concurrency > Math.max(1, task.targets.length)) errors.push('concurrency cannot exceed target count')

  for (const target of task.targets || []) {
    if (!target.hostId) errors.push('target.hostId is required')
    if (!target.hostName) errors.push('target.hostName is required')
    if (!target.hostAddress) errors.push('target.hostAddress is required')
  }

  for (const step of task.steps || []) {
    if (!step.id) errors.push('step.id is required')
    if (!step.command?.trim()) errors.push(`step ${step.id || '-'} command is required`)
    const risk = classifyCommand(step.command).risk
    if (risk === 'high_risk') errors.push(`step ${step.id || '-'} high-risk command requires explicit runtime confirmation`)
    if (risk !== 'read_only' && !step.verifyCommand?.trim()) errors.push(`step ${step.id || '-'} verifyCommand is required for change steps`)
    if (step.verifyCommand && classifyCommand(step.verifyCommand).risk !== 'read_only') errors.push(`step ${step.id || '-'} verifyCommand must be read-only`)
  }

  return { valid: errors.length === 0, errors }
}

export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  const safeLimit = Math.max(1, Math.floor(limit))
  let cursor = 0

  async function runNext() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  }

  const runners = Array.from({ length: Math.min(safeLimit, items.length) }, () => runNext())
  await Promise.all(runners)
  return results
}

export function shouldStopRemaining(task: OrchestrationTask, failed: OrchestrationStep | OrchestrationTarget): boolean {
  if ('command' in failed) {
    return failed.stopOnFailure && failed.status === 'failed' && failed.risk !== 'read_only'
  }
  const hasChangeStep = task.steps.some(step => step.risk !== 'read_only')
  return hasChangeStep && failed.status === 'failed'
}

export function summarizeOrchestration(task: OrchestrationTask): string {
  return task.targets.map(target => {
    const detail = target.error || target.summary || '-'
    return `${target.hostName} [${target.status}]\n${detail}`
  }).join('\n\n')
}
```

- [ ] **Step 4: 运行编排测试**

Run: `npm run test:ops-orchestration`
Expected: 打印 `Ops orchestration checks passed`，退出码为 0。

- [ ] **Step 5: 提交编排核心**

```bash
git add package.json scripts/verify-ops-orchestration.mjs src/utils/ops-orchestration.ts
git commit -m "feat: add ops orchestration core"
```

### Task 2: 增加编排 store 和通用卡片

**Files:**
- Create: `src/stores/orchestration.ts`
- Create: `src/components/OrchestrationTaskCard.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-ops-orchestration.mjs`

**Interfaces:**
- Consumes: `OrchestrationTask`, `OrchestrationTaskStatus`, `OrchestrationTargetStatus`, `OrchestrationStepStatus`
- Produces: `useOrchestrationStore()`, `OrchestrationTaskCard` props `{ task: OrchestrationTask; running: boolean }`

- [ ] **Step 1: 扩展测试，要求 store 和卡片存在**

Append to `scripts/verify-ops-orchestration.mjs` before final `console.log`:

```js
const storePath = resolve(root, 'src/stores/orchestration.ts')
const cardPath = resolve(root, 'src/components/OrchestrationTaskCard.vue')
assert.ok(existsSync(storePath), 'orchestration store must exist')
assert.ok(existsSync(cardPath), 'OrchestrationTaskCard.vue must exist')
const storeSource = readFileSync(storePath, 'utf8')
assert.match(storeSource, /defineStore\('orchestration'/, 'orchestration store must be named')
assert.match(storeSource, /setTargetStatus/, 'store must update target status')
assert.match(storeSource, /setStepStatus/, 'store must update step status')
assert.match(storeSource, /appendTargetSummary/, 'store must persist target summaries')
const cardSource = readFileSync(cardPath, 'utf8')
assert.match(cardSource, /defineProps<\{\s*task: OrchestrationTask/, 'card must receive OrchestrationTask')
assert.match(cardSource, /task\.targets/, 'card must display targets')
assert.match(cardSource, /task\.steps/, 'card must display steps')
```

Run: `npm run test:ops-orchestration`
Expected: 退出码非 0，错误说明 store 或卡片不存在。

- [ ] **Step 2: 实现编排 store**

Create `src/stores/orchestration.ts`:

```ts
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  OrchestrationTask,
  OrchestrationTaskStatus,
  OrchestrationTargetStatus,
  OrchestrationStepStatus,
} from '@/utils/ops-orchestration'

const MAX_SUMMARY_LENGTH = 500

function summarize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY_LENGTH)
}

export const useOrchestrationStore = defineStore('orchestration', () => {
  const currentTask = ref<OrchestrationTask | null>(null)
  const isRunning = computed(() => currentTask.value?.status === 'running' || currentTask.value?.status === 'verifying')

  function setTask(task: OrchestrationTask) {
    currentTask.value = task
  }

  function setTaskStatus(status: OrchestrationTaskStatus) {
    if (!currentTask.value) return
    currentTask.value.status = status
  }

  function setTargetStatus(hostId: string, status: OrchestrationTargetStatus, error = '') {
    const target = currentTask.value?.targets.find(item => item.hostId === hostId)
    if (!target) return
    target.status = status
    if (error) target.error = summarize(error)
  }

  function appendTargetSummary(hostId: string, summary: string) {
    const target = currentTask.value?.targets.find(item => item.hostId === hostId)
    if (!target) return
    target.summary = summarize(summary)
  }

  function setStepStatus(stepId: string, status: OrchestrationStepStatus) {
    const step = currentTask.value?.steps.find(item => item.id === stepId)
    if (!step) return
    step.status = status
  }

  function appendStepOutput(stepId: string, output: string, verification = false) {
    const step = currentTask.value?.steps.find(item => item.id === stepId)
    if (!step) return
    if (verification) step.verificationSummary = summarize(output)
    else step.outputSummary = summarize(output)
  }

  function stopTask() {
    if (!currentTask.value) return
    currentTask.value.status = 'stopped'
    currentTask.value.targets.forEach((target) => {
      if (target.status === 'pending' || target.status === 'connecting' || target.status === 'running') target.status = 'skipped'
    })
    currentTask.value.steps.forEach((step) => {
      if (step.status === 'pending' || step.status === 'waiting_approval' || step.status === 'running' || step.status === 'verifying') step.status = 'skipped'
    })
  }

  function clearTask() {
    currentTask.value = null
  }

  return {
    currentTask,
    isRunning,
    setTask,
    setTaskStatus,
    setTargetStatus,
    appendTargetSummary,
    setStepStatus,
    appendStepOutput,
    stopTask,
    clearTask,
  }
})
```

- [ ] **Step 3: 实现通用编排卡片**

Create `src/components/OrchestrationTaskCard.vue`:

```vue
<template>
  <div class="orchestration-card">
    <div class="orch-head">
      <div>
        <div class="orch-title">{{ task.title }}</div>
        <div class="orch-sub">{{ t(`ops.orchMode_${task.mode}`) }} · {{ t(`ops.orchType_${task.taskType}`) }} · {{ t('ops.orchConcurrency', { n: task.concurrency }) }}</div>
      </div>
      <el-tag size="small" :type="statusType(task.status)">{{ t(`ops.orchStatus_${task.status}`) }}</el-tag>
    </div>
    <div class="orch-steps">
      <div v-for="step in task.steps" :key="step.id" class="orch-step">
        <div class="orch-step-top">
          <span>{{ step.title }}</span>
          <el-tag size="small" :type="riskType(step.risk)">{{ t(`ai.risk_${step.risk}`) }}</el-tag>
          <el-tag size="small" effect="plain">{{ t(`ops.orchStep_${step.status}`) }}</el-tag>
        </div>
        <code>{{ step.command }}</code>
        <code v-if="step.verifyCommand" class="verify">{{ step.verifyCommand }}</code>
      </div>
    </div>
    <div class="orch-targets">
      <div v-for="target in task.targets" :key="target.hostId" class="orch-target" :class="target.status">
        <span class="target-name">{{ target.hostName }}</span>
        <span class="target-address">{{ target.hostAddress }}</span>
        <el-tag size="small" effect="plain">{{ t(`ops.orchTarget_${target.status}`) }}</el-tag>
        <p v-if="target.summary || target.error">{{ target.error || target.summary }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { CommandRisk } from '@/utils/ops-permission'
import type { OrchestrationTask, OrchestrationTaskStatus } from '@/utils/ops-orchestration'

defineProps<{ task: OrchestrationTask; running: boolean }>()
const { t } = useLocale()

function riskType(risk: CommandRisk) {
  if (risk === 'high_risk') return 'danger'
  if (risk === 'change' || risk === 'unknown') return 'warning'
  return 'success'
}

function statusType(status: OrchestrationTaskStatus) {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running' || status === 'verifying') return 'warning'
  return 'info'
}
</script>

<style scoped lang="scss">
.orchestration-card { padding: 10px; border: 1px solid $color-border-light; border-radius: $border-radius-md; background: $color-bg-surface; }
.orch-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.orch-title { font-size: $font-size-sm; font-weight: 600; color: $color-text-primary; }
.orch-sub { margin-top: 2px; color: $color-text-placeholder; font-size: $font-size-xs; }
.orch-steps, .orch-targets { display: grid; gap: 8px; margin-top: 10px; }
.orch-step, .orch-target { padding: 8px; border: 1px solid $color-border-light; border-radius: $border-radius-sm; background: $color-bg-input; }
.orch-step-top { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: $font-size-sm; color: $color-text-primary; }
code { display: block; margin-top: 4px; padding: 5px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.18); color: $color-text-secondary; white-space: pre-wrap; word-break: break-all; font-size: 11px; }
code.verify { color: $color-info; }
.orch-target { display: grid; grid-template-columns: minmax(100px, 1fr) minmax(120px, 1fr) auto; gap: 8px; align-items: center; }
.target-name { color: $color-text-primary; font-size: $font-size-sm; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.target-address { color: $color-text-placeholder; font-size: $font-size-xs; font-family: $font-family-mono; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
p { grid-column: 1 / -1; margin: 0; color: $color-text-placeholder; font-size: $font-size-xs; }
</style>
```

- [ ] **Step 4: 添加中英文文案**

Add under `ops` in `src/i18n/zh-CN.json`:

```json
"orchMode_single": "单机",
"orchMode_batch": "批量",
"orchType_inspection": "巡检",
"orchType_command": "命令",
"orchType_remediation": "自愈",
"orchConcurrency": "并发 {n}",
"orchConcurrencyLabel": "并发数",
"orchFailurePolicy": "失败停止后续变更批次",
"orchStatus_draft": "草稿",
"orchStatus_queued": "队列中",
"orchStatus_running": "运行中",
"orchStatus_verifying": "验证中",
"orchStatus_completed": "已完成",
"orchStatus_failed": "失败",
"orchStatus_stopped": "已停止",
"orchStep_pending": "等待",
"orchStep_waiting_approval": "待确认",
"orchStep_running": "执行中",
"orchStep_verifying": "验证中",
"orchStep_completed": "已完成",
"orchStep_failed": "失败",
"orchStep_skipped": "已跳过",
"orchTarget_pending": "等待",
"orchTarget_connecting": "连接中",
"orchTarget_running": "运行中",
"orchTarget_completed": "完成",
"orchTarget_failed": "失败",
"orchTarget_skipped": "已跳过"
```

Add equivalent keys under `ops` in `src/i18n/en.json`.

- [ ] **Step 5: 运行编排测试**

Run: `npm run test:ops-orchestration`
Expected: 打印 `Ops orchestration checks passed`，退出码为 0。

- [ ] **Step 6: 提交 store 和卡片**

```bash
git add src/stores/orchestration.ts src/components/OrchestrationTaskCard.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-ops-orchestration.mjs
git commit -m "feat: add ops orchestration state UI"
```

### Task 3: 升级批量页使用编排核心

**Files:**
- Modify: `src/views/ops/BatchPanel.vue`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- Consumes: `createCommandTask`, `runWithConcurrency`, `summarizeOrchestration`, `useOrchestrationStore`, existing `useOpsAgentStore`
- Produces: 批量页并发控制、授权执行器、编排卡片和复制汇总

- [ ] **Step 1: 增加会失败的批量安全断言**

Append to `scripts/verify-agent-execution.mjs`:

```js
const batchPanel = readFileSync(resolve(root, 'src/views/ops/BatchPanel.vue'), 'utf8')
assert(batchPanel.includes('useOrchestrationStore'), '批量页必须使用编排 store')
assert(batchPanel.includes('createCommandTask'), '批量命令必须创建编排任务')
assert(batchPanel.includes('runWithConcurrency'), '批量执行必须使用并发限制器')
assert(batchPanel.includes('opsAgentStore.decide'), '批量命令必须复用权限策略')
assert(!batchPanel.includes('const DANGER ='), '批量页不得使用独立高危正则绕过统一权限策略')
assert(!batchPanel.includes("import('@/api/tauri')") || batchPanel.includes('resolveSession'), '批量页只允许通过会话解析和授权执行器访问 SSH')
```

Run: `npm run test:agent-execution`
Expected: 退出码非 0，错误说明批量页尚未接入编排 store。

- [ ] **Step 2: 修改 imports 和状态**

In `src/views/ops/BatchPanel.vue`, replace script imports and constants:

```ts
import { computed, ref, reactive } from 'vue'
import { DocumentCopy, Files } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { sshExecFull, type SshExecResult } from '@/api/tauri'
import { useSshStore, type SshServer } from '@/stores/ssh'
import { useInspectionStore } from '@/stores/inspection'
import { useLocale } from '@/composables/useLocale'
import { useOpsAgentStore } from '@/stores/opsAgent'
import { useOrchestrationStore } from '@/stores/orchestration'
import { createCommandTask, runWithConcurrency, summarizeOrchestration, type OrchestrationTargetInput } from '@/utils/ops-orchestration'
import OrchestrationTaskCard from '@/components/OrchestrationTaskCard.vue'
```

Add:

```ts
const opsAgentStore = useOpsAgentStore()
const orchestrationStore = useOrchestrationStore()
const concurrency = ref(2)
const stopOnChangeFailure = ref(true)
const orchestrationSummary = computed(() => orchestrationStore.currentTask ? summarizeOrchestration(orchestrationStore.currentTask) : '')
```

Remove `const DANGER = ...`.

- [ ] **Step 3: 添加并发控件和编排卡片**

In template taskbar, after command input:

```vue
<el-input-number v-model="concurrency" size="small" :min="1" :max="Math.max(1, selected.size)" controls-position="right" class="bp-concurrency" />
<el-checkbox v-model="stopOnChangeFailure">{{ t('ops.orchFailurePolicy') }}</el-checkbox>
```

In results area before the old result blocks:

```vue
<OrchestrationTaskCard
  v-if="orchestrationStore.currentTask"
  :task="orchestrationStore.currentTask"
  :running="orchestrationStore.isRunning"
/>
```

Add CSS:

```scss
.bp-concurrency { width: 94px; flex-shrink: 0; }
```

- [ ] **Step 4: 实现批量授权和执行器**

Replace old danger confirmation logic inside `run()` with task creation:

```ts
function selectedTargets(): OrchestrationTargetInput[] {
  return sshStore.servers
    .filter(server => selected.has(server.id))
    .map(server => ({
      hostId: server.id,
      hostName: server.name,
      hostAddress: `${server.username}@${server.host}`,
    }))
}

function formatExecResult(result: SshExecResult): string {
  const parts = [result.stdout.trim(), result.stderr.trim() ? `[stderr]\n${result.stderr.trim()}` : ''].filter(Boolean)
  if (result.timed_out) return `${parts.join('\n') || '[无输出]'}\n[命令超时，已返回部分结果]`
  if (parts.length === 0) return `[命令执行完毕，退出码 ${result.exit_code ?? 0}，无输出]`
  return `${parts.join('\n')}${result.exit_code && result.exit_code !== 0 ? `\n[退出码 ${result.exit_code}]` : ''}`
}

async function authorizeBatchCommand(server: SshServer, commandText: string): Promise<{ allowed: boolean; auditId?: string; reason: string }> {
  const decision = opsAgentStore.decide(commandText, server.id)
  const auditId = opsAgentStore.recordAudit({
    hostId: server.id,
    hostName: server.name,
    command: commandText,
    decision,
    approved: decision.action === 'allow' ? true : null,
    status: decision.action === 'deny' ? 'denied' : 'pending',
  })
  if (decision.action === 'allow') return { allowed: true, auditId, reason: '' }
  if (decision.action === 'deny') return { allowed: false, auditId, reason: decision.reason }
  try {
    await ElMessageBox.confirm(
      `${server.name}\n${decision.reason}\n\n\`${commandText}\``,
      decision.action === 'double_confirm' ? t('ai.confirmHighRisk') : t('ai.confirmChange'),
      { type: decision.action === 'double_confirm' ? 'error' : 'warning', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') },
    )
    if (decision.action === 'double_confirm') {
      await ElMessageBox.confirm(
        `${server.name}\n${t('ai.confirmHighRiskAgain')}\n\n\`${commandText}\``,
        t('ai.confirmHighRiskAgain'),
        { type: 'error', confirmButtonText: t('common.confirm'), cancelButtonText: t('common.cancel') },
      )
    }
    opsAgentStore.setAuditApproval(auditId, true)
    return { allowed: true, auditId, reason: '' }
  } catch {
    opsAgentStore.setAuditApproval(auditId, false)
    return { allowed: false, auditId, reason: t('ai.commandBlocked') }
  }
}
```

- [ ] **Step 5: 改造 `run()` 使用并发限制和编排 store**

Replace the `Promise.all(targets.map(...))` block with:

```ts
const task = taskType.value === 'command'
  ? createCommandTask({
      mode: selected.size === 1 ? 'single' : 'batch',
      title: command.value.trim(),
      command: command.value.trim(),
      targets: selectedTargets(),
      concurrency: concurrency.value,
    })
  : null
if (task) orchestrationStore.setTask(task)

await runWithConcurrency(targets, task?.concurrency || concurrency.value, async (server, idx) => {
  const slot = results.value[idx]
  orchestrationStore.setTargetStatus(server.id, 'connecting')
  const sess = await resolveSession(server)
  if (!sess) {
    slot.status = 'failed'
    slot.output = 'Connection failed'
    orchestrationStore.setTargetStatus(server.id, 'failed', slot.output)
    return
  }
  slot.status = 'running'
  orchestrationStore.setTargetStatus(server.id, 'running')
  try {
    if (taskType.value === 'inspect') {
      const rep = await inspection.runInspection(sess.id, server.name, server.id)
      slot.score = rep.healthScore
      slot.critical = rep.findings.filter(f => f.severity === 'critical').length
      slot.warning = rep.findings.filter(f => f.severity === 'warning').length
      slot.status = 'done'
      orchestrationStore.setTargetStatus(server.id, 'completed')
      orchestrationStore.appendTargetSummary(server.id, `健康分 ${slot.score}，严重 ${slot.critical || 0}，警告 ${slot.warning || 0}`)
    } else {
      const auth = await authorizeBatchCommand(server, command.value.trim())
      if (!auth.allowed) {
        slot.status = 'failed'
        slot.output = auth.reason
        orchestrationStore.setTargetStatus(server.id, 'skipped', auth.reason)
        return
      }
      const result = await sshExecFull(sess.id, command.value.trim())
      slot.output = formatExecResult(result)
      if (auth.auditId) opsAgentStore.completeAudit(auth.auditId, slot.output)
      slot.status = result.exit_code && result.exit_code !== 0 ? 'failed' : 'done'
      orchestrationStore.setTargetStatus(server.id, slot.status === 'done' ? 'completed' : 'failed', slot.output)
      orchestrationStore.appendTargetSummary(server.id, slot.output)
      if (stopOnChangeFailure.value && slot.status === 'failed' && task?.steps.some(step => step.risk !== 'read_only')) {
        orchestrationStore.setTaskStatus('stopped')
      }
    }
  } catch (e: any) {
    slot.status = 'failed'
    slot.output = e?.message || String(e)
    orchestrationStore.setTargetStatus(server.id, 'failed', slot.output)
  } finally {
    if (sess.transient) { try { const { sshDisconnect } = await import('@/api/tauri'); await sshDisconnect(sess.id) } catch {} }
  }
})
if (orchestrationStore.currentTask?.status !== 'stopped') orchestrationStore.setTaskStatus(results.value.some(item => item.status === 'failed') ? 'failed' : 'completed')
```

- [ ] **Step 6: 更新复制汇总**

In `copyAll()`, use `orchestrationSummary` first:

```ts
const text = orchestrationSummary.value || results.value.map(...)
```

- [ ] **Step 7: 运行回归**

Run:

```powershell
npm run test:agent-execution
npm run test:ops-orchestration
npm run build
```

Expected: 三项退出码为 0；Vite 仅允许已有警告。

- [ ] **Step 8: 提交批量编排接入**

```bash
git add src/views/ops/BatchPanel.vue scripts/verify-agent-execution.mjs
git commit -m "feat: orchestrate batch ops execution"
```

### Task 4: 单机自愈同步到编排模型

**Files:**
- Modify: `src/components/AiChat.vue`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- Consumes: `useOrchestrationStore`, `OrchestrationTask`, existing `RemediationPlan`
- Produces: `syncRemediationToOrchestration(plan)`

- [ ] **Step 1: 增加单机编排断言**

Append to `scripts/verify-agent-execution.mjs`:

```js
assert(aiPanel.includes('useOrchestrationStore'), '单机 AI 面板必须使用编排 store')
assert(aiPanel.includes('syncRemediationToOrchestration'), '单机自愈必须同步到编排任务模型')
assert(aiPanel.includes("taskType: 'remediation'"), '单机自愈编排任务类型必须是 remediation')
```

Run: `npm run test:agent-execution`
Expected: 退出码非 0，错误说明单机 AI 面板尚未接入编排 store。

- [ ] **Step 2: 修改 imports 和 store 初始化**

In `src/components/AiChat.vue`, add:

```ts
import { useOrchestrationStore } from '@/stores/orchestration'
import type { OrchestrationTask } from '@/utils/ops-orchestration'
```

After `const remediationStore = useRemediationStore()`:

```ts
const orchestrationStore = useOrchestrationStore()
```

- [ ] **Step 3: 添加同步函数**

Add below `handleStartRemediation()`:

```ts
function syncRemediationToOrchestration(plan: RemediationPlan) {
  const task: OrchestrationTask = {
    id: plan.id.replace('ops-remediation', 'ops-orchestration'),
    mode: 'single',
    taskType: 'remediation',
    title: plan.title,
    concurrency: 1,
    targets: [{
      hostId: plan.hostId,
      hostName: plan.hostName,
      hostAddress: serverContext.value ? `${serverContext.value.username}@${serverContext.value.host}` : plan.hostName,
      sessionId: sshStore.activeSession?.realSessionId,
      status: 'pending',
    }],
    steps: plan.steps.map(step => ({
      id: step.id,
      title: step.title,
      command: step.command,
      verifyCommand: step.verifyCommand,
      risk: step.risk,
      stopOnFailure: step.stopOnFailure,
      status: step.status,
      auditId: step.auditId,
      outputSummary: step.outputSummary,
      verificationSummary: step.verificationSummary,
    })),
    status: 'queued',
    createdAt: plan.createdAt,
  }
  orchestrationStore.setTask(task)
}
```

In `handleStartRemediation()`, after `remediationStore.setPlan(plan)` add:

```ts
syncRemediationToOrchestration(plan)
```

- [ ] **Step 4: 同步执行状态**

In `executeRemediationPlan()`, after each `remediationStore.setPlanStatus(...)` and `remediationStore.setStepStatus(...)`, add matching `orchestrationStore.setTaskStatus(...)` and `orchestrationStore.setStepStatus(...)` calls. After command output or verification output, call `orchestrationStore.appendStepOutput(step.id, output, verification)`. On final success set first target to `completed`; on failure set it to `failed`; on stop set it to `skipped`.

- [ ] **Step 5: 运行回归**

Run:

```powershell
npm run test:agent-execution
npm run test:ops-remediation
npm run test:ops-orchestration
npm run build
```

Expected: 四项退出码为 0。

- [ ] **Step 6: 提交单机编排同步**

```bash
git add src/components/AiChat.vue scripts/verify-agent-execution.mjs
git commit -m "feat: mirror single host remediation orchestration"
```

### Task 5: 最终验证和规格状态

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-ops-agent-orchestration-design.md`

**Interfaces:**
- Consumes: Tasks 1-4 的编排核心、store、卡片、批量页和单机同步
- Produces: 已验证的本地 `main` 状态和更新后的规格状态

- [ ] **Step 1: 运行完整验证集**

Run:

```powershell
npm run test:agent-execution
npm run test:ops-permissions
npm run test:ops-remediation
npm run test:ops-orchestration
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
git diff --check
```

Expected: 所有命令退出码为 0；`git diff --check` 无输出。

- [ ] **Step 2: 执行桌面启动检查**

Run:

```powershell
$exe = 'E:\神州数码\文件\tauri-ai-demo-0.2.0\src-tauri\target\debug\aiterminal.exe'
if (-not (Test-Path $exe)) { throw "Missing executable: $exe" }
$proc = Start-Process -FilePath $exe -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 5
if ($proc.HasExited) { throw "AITerminal exited early with code $($proc.ExitCode)" }
try { $null = $proc.CloseMainWindow() } catch {}
Start-Sleep -Seconds 2
if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force }
Start-Sleep -Seconds 1
Write-Output 'AITerminal executable startup check passed.'
```

Expected: 打印 `AITerminal executable startup check passed.`，退出码为 0。

- [ ] **Step 3: 更新规格状态**

In `docs/superpowers/specs/2026-07-29-ops-agent-orchestration-design.md`, change:

```md
**状态：** 已设计，待实施
```

to:

```md
**状态：** 已实施，已验证
```

- [ ] **Step 4: 提交最终验证状态**

```bash
git add docs/superpowers/specs/2026-07-29-ops-agent-orchestration-design.md
git commit -m "docs: record ops orchestration verification"
```

## Plan Self-Review

- **Spec coverage:** Task 1 覆盖统一任务模型、校验、并发和失败停止；Task 2 覆盖编排状态和通用卡片；Task 3 覆盖批量页、多主机选择、并发、授权和汇总；Task 4 覆盖单机自愈同步到同一模型；Task 5 覆盖完整验证和启动检查。
- **Placeholder scan:** 本计划没有未完成占位、空泛错误处理描述或未展开的跨任务引用。
- **Type consistency:** `OrchestrationTask`、`OrchestrationTarget`、`OrchestrationStep`、`createCommandTask()`、`validateOrchestrationTask()`、`runWithConcurrency()`、`shouldStopRemaining()` 和 `summarizeOrchestration()` 在所有任务中的命名一致。
