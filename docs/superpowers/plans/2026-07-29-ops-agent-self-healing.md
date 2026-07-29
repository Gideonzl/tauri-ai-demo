# 运维智能体自愈执行链 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为运维智能体增加保守通用型自愈执行链：自动采集证据、生成可审查修复计划、按权限执行、逐步复查。

**Architecture:** 新增纯 TypeScript 自愈计划模块负责类型、校验和保守计划生成；Pinia store 负责当前计划和步骤状态；`AiChat.vue` 负责展示计划卡片并复用现有授权、审计和 SSH 执行入口。所有命令继续经过 `opsAgentStore.decide()`，自愈流程不直接绕过权限策略。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Tauri SSH invoke、Node.js 内置回归脚本、Vite、Cargo。

## Global Constraints

- 自愈流程必须复用现有命令权限策略和审计 store，不能直接调用 SSH。
- 高风险命令始终二次确认，自定义规则也不能把高风险降为自动执行。
- 变更步骤必须有验证命令；验证命令优先使用只读命令。
- 诊断证据不足时，只能追加只读诊断，不能猜测并执行修复命令。
- 任一变更步骤失败后，默认停止后续变更，让智能体基于失败输出重新分析。
- 用户不需要复制命令到终端；确认后软件自动通过 SSH 执行。
- 每个开发完成点都必须运行相关回归检查；最终必须实际启动桌面应用检查启动错误。

---

## File Structure

- Create `src/utils/ops-remediation.ts` — 纯自愈领域模型、计划校验、保守计划生成和状态归约；不依赖 Vue、Pinia 或 SSH。
- Create `src/stores/remediation.ts` — 当前自愈计划、步骤状态、输出摘要和计划生命周期。
- Create `src/components/RemediationPlanCard.vue` — 聊天区自愈计划卡片，展示证据、步骤、风险和执行状态。
- Modify `src/components/AiChat.vue` — 添加“自愈检查”入口、计划卡片、授权执行计划、执行后验证和失败停止。
- Modify `src/stores/agent.ts` — 强化运维智能体提示，要求先诊断、再计划、再执行、再验证。
- Modify `src/i18n/zh-CN.json` and `src/i18n/en.json` — 增加自愈计划、步骤状态、按钮和错误文案。
- Modify `scripts/verify-agent-execution.mjs` — 断言自愈执行链不能绕过授权和审计。
- Create `scripts/verify-ops-remediation.mjs` — 编译真实自愈模块并测试计划校验、保守生成和失败停止规则。
- Modify `package.json` — 添加 `test:ops-remediation` 脚本。
- Modify `docs/superpowers/specs/2026-07-29-ops-agent-self-healing-design.md` — 最终把状态改为“已实施，已验证”。

### Task 1: 建立纯自愈计划引擎

**Files:**
- Create: `src/utils/ops-remediation.ts`
- Create: `scripts/verify-ops-remediation.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `CommandRisk`, `classifyCommand` from `src/utils/ops-permission.ts`
- Produces: `RemediationPlan`, `RemediationStep`, `RemediationEvidence`, `validateRemediationPlan(plan)`, `createConservativeRemediationPlan(input)`, `shouldStopAfterStep(step)`

- [ ] **Step 1: 写入会失败的真实自愈测试**

Create `scripts/verify-ops-remediation.mjs` with this structure:

```js
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-remediation.ts')
assert.ok(existsSync(sourcePath), 'ops-remediation.ts must exist')

const tempDir = mkdtempSync(join(tmpdir(), 'ops-remediation-'))
try {
  const source = readFileSync(sourcePath, 'utf8')
  const permissionSource = readFileSync(resolve(root, 'src/utils/ops-permission.ts'), 'utf8')
  const js = ts.transpileModule(
    `${permissionSource}\n${source.replace(/import\\s+\\{[^}]+\\}\\s+from\\s+'@\\/utils\\/ops-permission'\\s*/g, '')}`,
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
  ).outputText
  const compiled = join(tempDir, 'ops-remediation.cjs')
  writeFileSync(compiled, js)
  const remediation = await import(compiled)

  const invalid = {
    id: 'bad',
    hostId: 'host-1',
    hostName: 'demo',
    issueType: 'disk',
    title: 'Bad plan',
    evidence: [],
    steps: [{ id: 's1', title: 'Clean', goal: 'free space', command: 'journalctl --vacuum-time=7d', verifyCommand: '', expectedResult: 'disk lower', risk: 'change', stopOnFailure: true, status: 'pending' }],
    createdAt: Date.now(),
    status: 'ready',
  }
  assert.equal(remediation.validateRemediationPlan(invalid).valid, false)
  assert.match(remediation.validateRemediationPlan(invalid).errors.join('\\n'), /verifyCommand/)

  const diskPlan = remediation.createConservativeRemediationPlan({
    hostId: 'host-1',
    hostName: 'demo',
    issueText: '磁盘满了，帮我修一下',
    diagnosticOutput: '/dev/vda1 40G 38G 2G 96% /\\nJournal disk usage is 3.2G',
  })
  assert.equal(diskPlan.issueType, 'disk')
  assert.ok(diskPlan.steps.some((step) => step.command.includes('journalctl --vacuum-time=7d')))
  assert.ok(diskPlan.steps.every((step) => step.verifyCommand.trim().length > 0))

  const servicePlan = remediation.createConservativeRemediationPlan({
    hostId: 'host-1',
    hostName: 'demo',
    issueText: 'nginx 服务起不来，帮我修',
    diagnosticOutput: 'nginx.service failed',
  })
  assert.equal(servicePlan.issueType, 'service')
  assert.ok(servicePlan.steps.some((step) => step.command === 'systemctl restart nginx'))
  assert.ok(servicePlan.steps.some((step) => step.verifyCommand === 'systemctl is-active nginx && systemctl status nginx --no-pager -l | head -40'))

  const failedStep = { ...servicePlan.steps[0], status: 'failed' }
  assert.equal(remediation.shouldStopAfterStep(failedStep), true)
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Ops remediation checks passed')
```

- [ ] **Step 2: 添加 package 脚本并确认测试失败**

Modify `package.json` scripts:

```json
"test:ops-remediation": "node scripts/verify-ops-remediation.mjs"
```

Run: `npm run test:ops-remediation`
Expected: 退出码非 0，错误包含 `ops-remediation.ts must exist`。

- [ ] **Step 3: 实现自愈类型、校验和保守计划生成**

Create `src/utils/ops-remediation.ts`:

```ts
import { classifyCommand, type CommandRisk } from '@/utils/ops-permission'

export type RemediationStepStatus = 'pending' | 'waiting_approval' | 'running' | 'verifying' | 'completed' | 'failed' | 'skipped'
export type RemediationPlanStatus = 'draft' | 'ready' | 'running' | 'completed' | 'failed' | 'stopped'
export type RemediationIssueType = 'service' | 'disk' | 'process' | 'network' | 'unknown'
export type EvidenceSeverity = 'info' | 'warning' | 'critical'

export interface RemediationEvidence {
  source: string
  summary: string
  severity: EvidenceSeverity
}

export interface RemediationStep {
  id: string
  title: string
  goal: string
  command: string
  verifyCommand: string
  expectedResult: string
  risk: CommandRisk
  stopOnFailure: boolean
  status: RemediationStepStatus
  auditId?: string
  outputSummary?: string
  verificationSummary?: string
}

export interface RemediationPlan {
  id: string
  hostId: string
  hostName: string
  issueType: RemediationIssueType
  title: string
  evidence: RemediationEvidence[]
  steps: RemediationStep[]
  createdAt: number
  status: RemediationPlanStatus
}

export interface RemediationPlanInput {
  hostId: string
  hostName: string
  issueText: string
  diagnosticOutput: string
}

export interface PlanValidationResult {
  valid: boolean
  errors: string[]
}

const SERVICE_NAMES = ['nginx', 'apache2', 'httpd', 'mysql', 'mysqld', 'mariadb', 'postgresql', 'redis', 'docker']

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function detectIssueType(input: RemediationPlanInput): RemediationIssueType {
  const text = `${input.issueText}\n${input.diagnosticOutput}`.toLowerCase()
  if (/disk|磁盘|inode|no space|空间|96%|9[0-9]%/.test(text)) return 'disk'
  if (/端口|port|listen|listening|connection|连接/.test(text)) return 'network'
  if (/cpu|memory|内存|进程|process|zombie/.test(text)) return 'process'
  if (/service|systemctl|failed|服务|起不来|nginx|mysql|redis|docker/.test(text)) return 'service'
  return 'unknown'
}

function detectServiceName(input: RemediationPlanInput): string | null {
  const text = `${input.issueText}\n${input.diagnosticOutput}`.toLowerCase()
  return SERVICE_NAMES.find((name) => new RegExp(`\\b${name}\\b`).test(text)) || null
}

function step(id: string, title: string, goal: string, command: string, verifyCommand: string, expectedResult: string): RemediationStep {
  return {
    id,
    title,
    goal,
    command,
    verifyCommand,
    expectedResult,
    risk: classifyCommand(command).risk,
    stopOnFailure: true,
    status: 'pending',
  }
}

export function validateRemediationPlan(plan: RemediationPlan): PlanValidationResult {
  const errors: string[] = []
  if (!plan.id) errors.push('plan.id is required')
  if (!plan.hostId) errors.push('hostId is required')
  if (!plan.hostName) errors.push('hostName is required')
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) errors.push('steps must contain at least one step')
  for (const item of plan.steps || []) {
    if (!item.id) errors.push('step.id is required')
    if (!item.command?.trim()) errors.push(`step ${item.id || '-'} command is required`)
    if (item.risk !== 'read_only' && !item.verifyCommand?.trim()) errors.push(`step ${item.id || '-'} verifyCommand is required for change steps`)
    if (classifyCommand(item.command).risk === 'high_risk') errors.push(`step ${item.id || '-'} contains high-risk command and cannot be generated by conservative self-healing`)
  }
  return { valid: errors.length === 0, errors }
}

export function shouldStopAfterStep(item: RemediationStep): boolean {
  return item.stopOnFailure && (item.status === 'failed' || item.status === 'skipped')
}

export function createConservativeRemediationPlan(input: RemediationPlanInput): RemediationPlan {
  const issueType = detectIssueType(input)
  const evidence: RemediationEvidence[] = [{
    source: 'diagnostics',
    summary: input.diagnosticOutput.slice(0, 500) || '已请求自愈，但当前诊断输出为空。',
    severity: issueType === 'unknown' ? 'warning' : 'critical',
  }]
  const steps: RemediationStep[] = []

  if (issueType === 'disk') {
    steps.push(step('disk-journal-usage', '查看日志占用', '确认 systemd journal 是否占用过多磁盘', 'journalctl --disk-usage 2>/dev/null || echo "journalctl unavailable"', 'df -h && df -i', '磁盘和 inode 使用率可读'))
    steps.push(step('disk-vacuum-journal', '清理旧 journal 日志', '只清理 7 天以前的 systemd journal 日志', 'journalctl --vacuum-time=7d', 'journalctl --disk-usage && df -h', '日志占用下降，根分区可用空间增加'))
  } else if (issueType === 'service') {
    const serviceName = detectServiceName(input)
    if (serviceName) {
      steps.push(step('service-status', '复查服务状态', `确认 ${serviceName} 当前状态和最近日志`, `systemctl status ${serviceName} --no-pager -l | head -80`, `systemctl is-active ${serviceName}`, '服务状态可读'))
      steps.push(step('service-restart', '重启服务', `尝试重启 ${serviceName}`, `systemctl restart ${serviceName}`, `systemctl is-active ${serviceName} && systemctl status ${serviceName} --no-pager -l | head -40`, '服务恢复 active 状态'))
    }
  } else if (issueType === 'network') {
    steps.push(step('network-listen', '复查监听端口', '确认当前监听端口和连接状态', 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', 'ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null', '端口监听信息可读'))
  } else if (issueType === 'process') {
    steps.push(step('process-top', '复查高占用进程', '确认 CPU 和内存占用最高的进程', 'ps aux --sort=-%cpu | head -15 && ps aux --sort=-%mem | head -15', 'ps aux --sort=-%cpu | head -15', '高占用进程信息可读'))
  }

  if (steps.length === 0) {
    steps.push(step('safe-context', '追加安全诊断', '当前证据不足，仅追加只读诊断', 'uptime && free -h && df -h && ss -tlnp 2>/dev/null | head -40', 'uptime && df -h', '获得更多上下文'))
  }

  const plan: RemediationPlan = {
    id: createId('ops-remediation'),
    hostId: input.hostId,
    hostName: input.hostName,
    issueType,
    title: issueType === 'unknown' ? '保守自愈诊断计划' : `保守自愈计划：${issueType}`,
    evidence,
    steps,
    createdAt: Date.now(),
    status: 'ready',
  }
  const validation = validateRemediationPlan(plan)
  if (!validation.valid) return { ...plan, status: 'draft', steps: plan.steps.filter((item) => item.risk === 'read_only' || item.verifyCommand.trim()) }
  return plan
}
```

- [ ] **Step 4: 运行自愈测试**

Run: `npm run test:ops-remediation`
Expected: 打印 `Ops remediation checks passed`，退出码为 0。

- [ ] **Step 5: 提交纯计划引擎**

```bash
git add src/utils/ops-remediation.ts scripts/verify-ops-remediation.mjs package.json package-lock.json
git commit -m "feat: add ops remediation plan engine"
```

### Task 2: 增加自愈状态 store 和计划卡片

**Files:**
- Create: `src/stores/remediation.ts`
- Create: `src/components/RemediationPlanCard.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-ops-remediation.mjs`

**Interfaces:**
- Consumes: `RemediationPlan`, `RemediationStepStatus` from `src/utils/ops-remediation.ts`
- Produces: `useRemediationStore()`, `RemediationPlanCard` props `{ plan: RemediationPlan; running: boolean }` and emits `execute`, `stop`

- [ ] **Step 1: 扩展失败测试覆盖 store 和卡片存在**

Append to `scripts/verify-ops-remediation.mjs` after the pure module assertions:

```js
const storeSource = readFileSync(resolve(root, 'src/stores/remediation.ts'), 'utf8')
assert.match(storeSource, /defineStore\\('remediation'/, 'remediation store must exist')
assert.match(storeSource, /setStepStatus/, 'store must update individual step status')
assert.match(storeSource, /appendStepOutput/, 'store must persist step output summaries')
assert.match(storeSource, /stopPlan/, 'store must support stopping a plan')

const cardSource = readFileSync(resolve(root, 'src/components/RemediationPlanCard.vue'), 'utf8')
assert.match(cardSource, /defineProps<\\{\\s*plan: RemediationPlan/, 'plan card must receive a RemediationPlan')
assert.match(cardSource, /defineEmits<\\{\\s*execute:/, 'plan card must emit execute')
assert.match(cardSource, /verifyCommand/, 'plan card must show verification command')
```

Run: `npm run test:ops-remediation`
Expected: 退出码非 0，错误说明 `remediation.ts` 或 `RemediationPlanCard.vue` 不存在。

- [ ] **Step 2: 实现 store**

Create `src/stores/remediation.ts`:

```ts
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RemediationPlan, RemediationPlanStatus, RemediationStepStatus } from '@/utils/ops-remediation'

const MAX_OUTPUT_LENGTH = 500

function summarize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_OUTPUT_LENGTH)
}

export const useRemediationStore = defineStore('remediation', () => {
  const currentPlan = ref<RemediationPlan | null>(null)
  const isRunning = computed(() => currentPlan.value?.status === 'running')

  function setPlan(plan: RemediationPlan) {
    currentPlan.value = plan
  }

  function setPlanStatus(status: RemediationPlanStatus) {
    if (!currentPlan.value) return
    currentPlan.value.status = status
  }

  function setStepStatus(stepId: string, status: RemediationStepStatus) {
    const item = currentPlan.value?.steps.find((step) => step.id === stepId)
    if (!item) return
    item.status = status
  }

  function setStepAudit(stepId: string, auditId?: string) {
    const item = currentPlan.value?.steps.find((step) => step.id === stepId)
    if (!item) return
    item.auditId = auditId
  }

  function appendStepOutput(stepId: string, output: string, verification = false) {
    const item = currentPlan.value?.steps.find((step) => step.id === stepId)
    if (!item) return
    if (verification) item.verificationSummary = summarize(output)
    else item.outputSummary = summarize(output)
  }

  function stopPlan() {
    if (!currentPlan.value) return
    currentPlan.value.status = 'stopped'
    currentPlan.value.steps.forEach((step) => {
      if (step.status === 'pending' || step.status === 'waiting_approval' || step.status === 'running' || step.status === 'verifying') {
        step.status = 'skipped'
      }
    })
  }

  function clearPlan() {
    currentPlan.value = null
  }

  return {
    currentPlan,
    isRunning,
    setPlan,
    setPlanStatus,
    setStepStatus,
    setStepAudit,
    appendStepOutput,
    stopPlan,
    clearPlan,
  }
})
```

- [ ] **Step 3: 实现计划卡片组件**

Create `src/components/RemediationPlanCard.vue` with a compact operations UI:

```vue
<template>
  <div class="remediation-card">
    <div class="remediation-top">
      <div>
        <div class="remediation-title">{{ plan.title }}</div>
        <div class="remediation-sub">{{ plan.hostName }} · {{ t(`ai.remediationIssue_${plan.issueType}`) }}</div>
      </div>
      <el-tag size="small" :type="statusType(plan.status)">{{ t(`ai.remediationStatus_${plan.status}`) }}</el-tag>
    </div>

    <div class="evidence-list">
      <div v-for="item in plan.evidence" :key="item.source" class="evidence-item">
        <el-tag size="small" effect="plain" :type="item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'">{{ item.source }}</el-tag>
        <span>{{ item.summary }}</span>
      </div>
    </div>

    <div class="step-list">
      <div v-for="step in plan.steps" :key="step.id" class="step-item">
        <div class="step-head">
          <span>{{ step.title }}</span>
          <el-tag size="small" :type="riskType(step.risk)">{{ t(`ai.risk_${step.risk}`) }}</el-tag>
          <el-tag size="small" effect="plain">{{ t(`ai.remediationStep_${step.status}`) }}</el-tag>
        </div>
        <div class="step-goal">{{ step.goal }}</div>
        <code>{{ step.command }}</code>
        <code class="verify">{{ step.verifyCommand }}</code>
        <p v-if="step.outputSummary">{{ step.outputSummary }}</p>
        <p v-if="step.verificationSummary">{{ step.verificationSummary }}</p>
      </div>
    </div>

    <div class="remediation-actions">
      <el-button size="small" type="primary" :loading="running" :disabled="running || plan.status === 'completed'" @click="emit('execute')">{{ t('ai.remediationExecute') }}</el-button>
      <el-button size="small" :disabled="!running" @click="emit('stop')">{{ t('ai.remediationStop') }}</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import type { CommandRisk } from '@/utils/ops-permission'
import type { RemediationPlan, RemediationPlanStatus } from '@/utils/ops-remediation'

defineProps<{ plan: RemediationPlan; running: boolean }>()
const emit = defineEmits<{ execute: []; stop: [] }>()
const { t } = useLocale()

function riskType(risk: CommandRisk) {
  if (risk === 'high_risk') return 'danger'
  if (risk === 'change' || risk === 'unknown') return 'warning'
  return 'success'
}

function statusType(status: RemediationPlanStatus) {
  if (status === 'completed') return 'success'
  if (status === 'failed') return 'danger'
  if (status === 'running') return 'warning'
  return 'info'
}
</script>

<style scoped lang="scss">
.remediation-card { margin: 8px 0 12px; padding: 10px; border: 1px solid $color-border-light; border-radius: $border-radius-md; background: $color-bg-surface; }
.remediation-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
.remediation-title { font-weight: 600; font-size: $font-size-sm; color: $color-text-primary; }
.remediation-sub { margin-top: 2px; font-size: $font-size-xs; color: $color-text-placeholder; }
.evidence-list { display: grid; gap: 6px; margin-top: 8px; }
.evidence-item { display: flex; align-items: flex-start; gap: 6px; font-size: $font-size-xs; color: $color-text-secondary; }
.step-list { display: grid; gap: 8px; margin-top: 10px; }
.step-item { padding: 8px; border: 1px solid $color-border-light; border-radius: $border-radius-sm; background: $color-bg-input; }
.step-head { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: $font-size-sm; color: $color-text-primary; }
.step-goal { margin: 4px 0; font-size: $font-size-xs; color: $color-text-secondary; }
code { display: block; margin-top: 4px; padding: 5px 6px; border-radius: 4px; background: rgba(0, 0, 0, 0.18); color: $color-text-secondary; white-space: pre-wrap; word-break: break-all; font-size: 11px; }
code.verify { color: $color-info; }
p { margin: 5px 0 0; color: $color-text-placeholder; font-size: $font-size-xs; }
.remediation-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; }
</style>
```

- [ ] **Step 4: 添加中英文文案**

Add these keys under the existing `ai` namespace in `src/i18n/zh-CN.json`:

```json
"remediationStart": "自愈检查",
"remediationExecute": "执行计划",
"remediationStop": "停止计划",
"remediationNoSession": "当前没有可用的 SSH 会话，无法执行自愈计划",
"remediationCollecting": "正在采集自愈证据...",
"remediationCreated": "已生成自愈计划",
"remediationStopped": "自愈计划已停止",
"remediationCompleted": "自愈计划已完成",
"remediationFailed": "自愈计划执行失败",
"remediationIssue_service": "服务异常",
"remediationIssue_disk": "磁盘空间",
"remediationIssue_process": "进程异常",
"remediationIssue_network": "网络端口",
"remediationIssue_unknown": "未知问题",
"remediationStatus_draft": "草稿",
"remediationStatus_ready": "待执行",
"remediationStatus_running": "执行中",
"remediationStatus_completed": "已完成",
"remediationStatus_failed": "失败",
"remediationStatus_stopped": "已停止",
"remediationStep_pending": "等待",
"remediationStep_waiting_approval": "待确认",
"remediationStep_running": "执行中",
"remediationStep_verifying": "验证中",
"remediationStep_completed": "已完成",
"remediationStep_failed": "失败",
"remediationStep_skipped": "已跳过",
"risk_read_only": "只读",
"risk_change": "变更",
"risk_high_risk": "高风险",
"risk_unknown": "未知"
```

Add equivalent keys under `ai` in `src/i18n/en.json`:

```json
"remediationStart": "Self-heal",
"remediationExecute": "Run plan",
"remediationStop": "Stop plan",
"remediationNoSession": "No active SSH session is available for self-healing",
"remediationCollecting": "Collecting self-healing evidence...",
"remediationCreated": "Self-healing plan created",
"remediationStopped": "Self-healing plan stopped",
"remediationCompleted": "Self-healing plan completed",
"remediationFailed": "Self-healing plan failed",
"remediationIssue_service": "Service issue",
"remediationIssue_disk": "Disk space",
"remediationIssue_process": "Process issue",
"remediationIssue_network": "Network ports",
"remediationIssue_unknown": "Unknown issue",
"remediationStatus_draft": "Draft",
"remediationStatus_ready": "Ready",
"remediationStatus_running": "Running",
"remediationStatus_completed": "Completed",
"remediationStatus_failed": "Failed",
"remediationStatus_stopped": "Stopped",
"remediationStep_pending": "Pending",
"remediationStep_waiting_approval": "Waiting approval",
"remediationStep_running": "Running",
"remediationStep_verifying": "Verifying",
"remediationStep_completed": "Completed",
"remediationStep_failed": "Failed",
"remediationStep_skipped": "Skipped",
"risk_read_only": "Read-only",
"risk_change": "Change",
"risk_high_risk": "High risk",
"risk_unknown": "Unknown"
```

- [ ] **Step 5: 运行自愈回归测试**

Run: `npm run test:ops-remediation`
Expected: 打印 `Ops remediation checks passed`，退出码为 0。

- [ ] **Step 6: 提交状态层和卡片**

```bash
git add src/stores/remediation.ts src/components/RemediationPlanCard.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-ops-remediation.mjs
git commit -m "feat: add ops remediation plan UI"
```

### Task 3: 将自愈计划接入聊天和授权执行链

**Files:**
- Modify: `src/components/AiChat.vue`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- Consumes: `useRemediationStore()`, `createConservativeRemediationPlan(input)`, `shouldStopAfterStep(step)`, existing `handleConfirmCommand(command)`, existing `handleCommandCompleted(command, result, authorization)`
- Produces: `handleStartRemediation(issueText?)`, `executeRemediationPlan()`, `runRemediationCommand(command)`

- [ ] **Step 1: 增加会失败的授权链断言**

Append to `scripts/verify-agent-execution.mjs`:

```js
assert(aiPanel.includes('useRemediationStore'), '聊天面板必须使用自愈 store')
assert(aiPanel.includes('RemediationPlanCard'), '聊天面板必须展示自愈计划卡片')
assert(aiPanel.includes('createConservativeRemediationPlan'), '自愈必须通过本地计划生成器创建计划')
assert(aiPanel.includes('executeRemediationPlan'), '聊天面板必须提供计划执行函数')
assert(aiPanel.includes('handleConfirmCommand(step.command)'), '自愈执行步骤必须复用统一授权回调')
assert(aiPanel.includes('handleConfirmCommand(step.verifyCommand)'), '自愈验证步骤也必须复用统一授权回调')
assert(aiPanel.includes('shouldStopAfterStep'), '自愈失败后必须根据停止策略停止后续步骤')
```

Run: `npm run test:agent-execution`
Expected: 退出码非 0，错误说明自愈 store 或计划卡片尚未接入聊天面板。

- [ ] **Step 2: 修改模板，显示入口和计划卡片**

In `src/components/AiChat.vue`:

Add inside the existing ops-only header template after `OpsAuditDrawer` button:

```vue
<el-button size="small" text :title="t('ai.remediationStart')" @click="handleStartRemediation()">
  <el-icon :size="15"><FirstAidKit /></el-icon>
</el-button>
```

Add inside `.message-list`, after the `v-for="msg in messages"` block and before the generating bar:

```vue
<RemediationPlanCard
  v-if="agentStore.activeAgentId === 'ops' && remediationStore.currentPlan"
  :plan="remediationStore.currentPlan"
  :running="remediationStore.isRunning"
  @execute="executeRemediationPlan"
  @stop="handleStopRemediation"
/>
```

- [ ] **Step 3: 修改 imports 和 store 初始化**

In `src/components/AiChat.vue` script imports:

```ts
import { createConservativeRemediationPlan, shouldStopAfterStep, type RemediationStep } from '@/utils/ops-remediation'
import { useRemediationStore } from '@/stores/remediation'
import RemediationPlanCard from '@/components/RemediationPlanCard.vue'
import { FirstAidKit } from '@element-plus/icons-vue'
```

If `FirstAidKit` is not exported by the installed Element Plus icons package, use `CirclePlus` and keep the button title text unchanged.

After `const opsAgentStore = useOpsAgentStore()`:

```ts
const remediationStore = useRemediationStore()
```

- [ ] **Step 4: 添加自愈证据采集和计划生成**

Add these functions below `runAuthorizedDiagnostic`:

```ts
async function collectRemediationEvidence(): Promise<string> {
  const groups = ['health', 'disk', 'processes', 'network']
  const outputs: string[] = []
  for (const groupId of groups) {
    const output = await runDiagnostics(groupId, runAuthorizedDiagnostic, (label) => {
      ElMessage.info(`${t('ai.remediationCollecting')} ${label}`)
    })
    outputs.push(`--- ${groupId} ---\n${output}`)
  }
  return outputs.join('\n\n')
}

async function handleStartRemediation(issueText = inputText.value.trim()) {
  const session = sshStore.activeSession
  if (!session?.realSessionId || session.status !== 'connected') {
    ElMessage.warning(t('ai.remediationNoSession'))
    return
  }
  if (remediationStore.isRunning) return
  const prompt = issueText || messages.value[messages.value.length - 1]?.content || '请对当前服务器执行保守自愈检查'
  chatStore.addUserMessage(agentStore.activeAgentId, t('ai.remediationCollecting'))
  scrollToBottom()
  const diagnosticOutput = await collectRemediationEvidence()
  const plan = createConservativeRemediationPlan({
    hostId: activeHost.value.id,
    hostName: activeHost.value.name || session.serverName,
    issueText: prompt,
    diagnosticOutput,
  })
  remediationStore.setPlan(plan)
  ElMessage.success(t('ai.remediationCreated'))
  scrollToBottom()
}

function handleStopRemediation() {
  remediationStore.stopPlan()
  ElMessage.warning(t('ai.remediationStopped'))
}
```

- [ ] **Step 5: 添加授权执行和验证函数**

Add these functions below `handleStartRemediation`:

```ts
async function runRemediationCommand(step: RemediationStep, command: string, verification = false): Promise<boolean> {
  const sessionId = sshStore.activeSession?.realSessionId
  if (!sessionId) {
    remediationStore.setStepStatus(step.id, 'failed')
    remediationStore.appendStepOutput(step.id, t('ai.remediationNoSession'), verification)
    return false
  }
  const authorization = await handleConfirmCommand(command)
  if (!authorization.allowed) {
    remediationStore.setStepStatus(step.id, 'skipped')
    remediationStore.appendStepOutput(step.id, authorization.denialMessage, verification)
    return false
  }
  if (authorization.auditId && !verification) remediationStore.setStepAudit(step.id, authorization.auditId)
  let output: string
  try {
    const result = await sshExecFull(sessionId, command)
    output = formatDiagnosticResult(result)
  } catch (error: any) {
    output = `[执行错误] ${error?.message || String(error)}`
  }
  handleCommandCompleted(command, output, authorization)
  remediationStore.appendStepOutput(step.id, output, verification)
  return !/^\[执行错误\]/.test(output.trim()) && !/\[退出码 [1-9]/.test(output)
}

async function executeRemediationPlan() {
  const plan = remediationStore.currentPlan
  if (!plan || remediationStore.isRunning) return
  remediationStore.setPlanStatus('running')
  for (const step of plan.steps) {
    remediationStore.setStepStatus(step.id, 'waiting_approval')
    const executed = await runRemediationCommand(step, step.command)
    if (!executed) {
      remediationStore.setStepStatus(step.id, step.status === 'skipped' ? 'skipped' : 'failed')
      if (shouldStopAfterStep(step)) {
        remediationStore.setPlanStatus(step.status === 'skipped' ? 'stopped' : 'failed')
        ElMessage.error(t('ai.remediationFailed'))
        return
      }
      continue
    }
    remediationStore.setStepStatus(step.id, 'verifying')
    const verified = await runRemediationCommand(step, step.verifyCommand, true)
    remediationStore.setStepStatus(step.id, verified ? 'completed' : 'failed')
    if (!verified && shouldStopAfterStep(step)) {
      remediationStore.setPlanStatus('failed')
      ElMessage.error(t('ai.remediationFailed'))
      return
    }
  }
  remediationStore.setPlanStatus('completed')
  ElMessage.success(t('ai.remediationCompleted'))
}
```

- [ ] **Step 6: 让故障类输入自动生成计划**

At the start of `handleSend()`, after model config checks and before `chatStore.addUserMessage(...)`, add:

```ts
const wantsRemediation = agentStore.activeAgentId === 'ops'
  && agentStore.activeMode === 'agent'
  && /(自愈|修复|帮我修|故障|异常|起不来|磁盘满|端口|服务)/.test(text)

if (wantsRemediation && sshStore.activeSession?.status === 'connected') {
  inputText.value = ''
  await handleStartRemediation(text)
  return
}
```

- [ ] **Step 7: 运行聊天授权回归**

Run: `npm run test:agent-execution; npm run test:ops-remediation`
Expected: 两项均退出码 0。

- [ ] **Step 8: 提交聊天接入**

```bash
git add src/components/AiChat.vue scripts/verify-agent-execution.mjs
git commit -m "feat: run ops remediation through chat"
```

### Task 4: 强化提示词和执行安全测试

**Files:**
- Modify: `src/stores/agent.ts`
- Modify: `scripts/verify-agent-execution.mjs`
- Modify: `scripts/verify-ops-remediation.mjs`

**Interfaces:**
- Consumes: existing ops agent `systemPrompt`
- Produces: regression assertions that self-healing is plan-first, authorized, audited, and never delegates terminal work to the user

- [ ] **Step 1: 增加提示词断言**

Append to `scripts/verify-agent-execution.mjs`:

```js
const agentStore = readFileSync(resolve(root, 'src/stores/agent.ts'), 'utf8')
assert(agentStore.includes('自愈执行链'), '运维智能体提示必须说明自愈执行链')
assert(agentStore.includes('先采集证据，再生成修复计划'), '运维智能体必须先诊断再计划')
assert(agentStore.includes('每一步执行后必须验证'), '运维智能体必须要求执行后验证')
assert(agentStore.includes('不得让用户手动复制命令到终端'), '运维智能体不得把命令退回给用户手动执行')
```

- [ ] **Step 2: 增加高风险和失败停止断言**

Append to `scripts/verify-ops-remediation.mjs`:

```js
const riskyPlan = {
  ...servicePlan,
  steps: [{ ...servicePlan.steps[0], id: 'danger', command: 'rm -rf /var/log/nginx', risk: 'high_risk' }],
}
assert.equal(remediation.validateRemediationPlan(riskyPlan).valid, false)
assert.match(remediation.validateRemediationPlan(riskyPlan).errors.join('\\n'), /high-risk/)
```

Run: `npm run test:agent-execution; npm run test:ops-remediation`
Expected: 至少 `test:agent-execution` 失败，因为提示词还没有新增自愈执行链说明。

- [ ] **Step 3: 更新运维智能体提示词**

In `src/stores/agent.ts`, add this section to the ops agent system prompt:

```text
## 自愈执行链

- 当用户说“修复、帮我修、自愈、故障、异常、服务起不来、磁盘满、端口异常”等请求时，先采集证据，再生成修复计划。
- 修复计划必须包含：现象、证据、命令、风险、验证命令、失败后是否停止。
- 每一步执行后必须验证；验证失败时停止后续变更，并基于失败输出重新分析。
- 不得生成递归删除、格式化磁盘、删除账户、清空防火墙、修改 SSH 登录策略等高风险自愈步骤。
- 命令权限由系统策略独立裁决，不得让用户手动复制命令到终端，也不得尝试绕过确认弹窗。
```

- [ ] **Step 4: 运行全部脚本和构建**

Run:

```powershell
npm run test:agent-execution
npm run test:ops-permissions
npm run test:ops-remediation
npm run build
cargo check --manifest-path src-tauri\Cargo.toml
```

Expected: 五项均退出码 0；Vite 仅允许已有依赖注释和 chunk 大小警告，不允许编译错误。

- [ ] **Step 5: 提交提示词和安全测试**

```bash
git add src/stores/agent.ts scripts/verify-agent-execution.mjs scripts/verify-ops-remediation.mjs
git commit -m "feat: harden ops remediation workflow"
```

### Task 5: 最终验证、启动检查和规格状态

**Files:**
- Modify: `docs/superpowers/specs/2026-07-29-ops-agent-self-healing-design.md`

**Interfaces:**
- Consumes: Tasks 1-4 的自愈计划引擎、store、UI、授权执行和提示词更新
- Produces: 已验证的本地 `main` 状态和更新后的规格状态

- [ ] **Step 1: 运行完整验证集**

Run:

```powershell
npm run test:agent-execution
npm run test:ops-permissions
npm run test:ops-remediation
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

In `docs/superpowers/specs/2026-07-29-ops-agent-self-healing-design.md`, change:

```md
**状态：** 已设计，待实施
```

to:

```md
**状态：** 已实施，已验证
```

- [ ] **Step 4: 提交最终验证状态**

```bash
git add docs/superpowers/specs/2026-07-29-ops-agent-self-healing-design.md
git commit -m "docs: record ops remediation verification"
```

## Plan Self-Review

- **Spec coverage:** Task 1 覆盖自愈领域类型、计划校验、保守计划生成和变更步骤必须带验证命令；Task 2 覆盖状态 store 与计划卡片；Task 3 覆盖聊天入口、授权执行、执行后验证和失败停止；Task 4 覆盖提示词、安全回归和高风险拒绝；Task 5 覆盖完整验证和桌面启动检查。
- **Placeholder scan:** 本计划没有未完成占位、空泛错误处理描述或未展开的跨任务引用。
- **Type consistency:** `RemediationPlan`、`RemediationStep`、`RemediationStepStatus`、`createConservativeRemediationPlan()`、`validateRemediationPlan()`、`shouldStopAfterStep()` 在所有任务中的命名一致；聊天层只通过 `handleConfirmCommand()` 和 `handleCommandCompleted()` 复用既有权限与审计链。
