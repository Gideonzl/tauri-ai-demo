# AI Agent 2.0 Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, context-aware operations agent that can collect evidence, request only policy-required authorization, execute commands, verify outcomes, and survive SSH reconnects without losing its task.

**Architecture:** Add four focused, framework-light modules for troubleshooting state, bounded context assembly, response/action parsing, and authorized execution. `AiChat.vue` remains the composition layer, while `ai-chat.ts` owns model streaming and the tool loop; existing permission, operation-record, SSH, and chat stores remain the source of truth.

**Tech Stack:** Vue 3, Pinia, TypeScript 5.6, Tauri 2, Element Plus, Node assertion scripts, Vite 6

**Spec:** `docs/superpowers/specs/2026-08-21-ai-agent-2-design.md`

## Global Constraints

- This is a personal operations tool; do not add team roles, tickets, or approval management.
- Preserve the existing permission levels `readonly`, `controlled`, `elevated`, and `custom`.
- High-risk commands always require `double_confirm`; the model cannot lower command risk.
- Never include passwords, private keys, key passphrases, model tokens, Authorization values, cookies, database credentials, or cloud credentials in model context.
- Agent context is at most 24 KB; each operation output is at most 4 KB; include at most 8 operations.
- Persist at most 50 troubleshooting sessions under `ai-troubleshooting-sessions-v1`.
- A user request may execute at most 12 actions and use at most 8 model continuation rounds.
- SSH reconnect, panel collapse, and route changes do not clear chat or troubleshooting state.
- Reuse `operation-records-v1`, `ai-chat-conversations`, and existing audit storage instead of duplicating raw command output.
- Preserve the current `<execute_command>` protocol while adding `<agent_action>` compatibility.
- Every task ends with its focused test, `npm run build`, and a Vite startup-error check. Do not package an installer.

## File Structure

### New files

- `src/utils/troubleshooting-session.ts` — pure task model, sanitization, persistence, and state-transition rules.
- `src/stores/troubleshooting.ts` — Pinia wrapper that associates one troubleshooting task with one conversation.
- `src/utils/agent-context.ts` — builds and formats bounded, redacted context snapshots.
- `src/utils/agent-response.ts` — parses legacy and new action blocks and filters them from streaming UI text.
- `src/utils/agent-execution.ts` — runs one policy-authorized action, retries one connection-level failure, and verifies changes.
- `src/utils/agent-prompt.ts` — composes stable rules, dynamic context, and execution capability instructions.
- `scripts/test-troubleshooting-session.mjs` — persistence and transition regression tests.
- `scripts/test-agent-context.mjs` — context selection, budget, and redaction tests.
- `scripts/test-agent-response.mjs` — parser and chunk-boundary stream-filter tests.
- `scripts/test-agent-execution-core.mjs` — authorization, retry, verification, and limit tests.
- `scripts/verify-ai-agent-2.mjs` — source wiring and storage-cleanup regression check.

### Modified files

- `src/utils/ai-chat.ts` — use prompt composer, parsed actions, stream filter, execution coordinator, context, and state callbacks.
- `src/components/AiChat.vue` — assemble context, maintain the current task, record AI operations, and show one compact task status.
- `src/main.ts` — initialize troubleshooting persistence.
- `src/views/SettingsView.vue` — include troubleshooting state in AI/history backup and deletion.
- `src/i18n/zh-CN.json` — Chinese task-state labels and recovery messages.
- `src/i18n/en.json` — matching English labels.
- `src/stores/agent.ts` — shorten the operations-agent prompt to stable role rules; dynamic information moves to `agent-prompt.ts`.
- `scripts/verify-agent-execution.mjs` — update assertions for the coordinator and context-aware stream signature.
- `package.json` — add focused test scripts.

---

### Task 1: Persistent Troubleshooting Session Model

**Files:**
- Create: `src/utils/troubleshooting-session.ts`
- Create: `src/stores/troubleshooting.ts`
- Create: `scripts/test-troubleshooting-session.mjs`
- Modify: `src/main.ts:55-65`
- Modify: `package.json:6-23`

**Interfaces:**
- Consumes: browser-compatible `Storage` methods `getItem`, `setItem`, and `removeItem`.
- Produces: `TROUBLESHOOTING_STORAGE_KEY`, `TroubleshootingState`, `TroubleshootingSession`, `loadTroubleshootingSessions()`, `saveTroubleshootingSessions()`, and `useTroubleshootingStore()`.

- [ ] **Step 1: Write the failing persistence and transition test**

Create `scripts/test-troubleshooting-session.mjs`:

```js
import assert from 'node:assert/strict'
import {
  TROUBLESHOOTING_STORAGE_KEY,
  canTransitionTroubleshooting,
  loadTroubleshootingSessions,
  saveTroubleshootingSessions,
} from '../src/utils/troubleshooting-session.ts'

class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, value) }
  removeItem(key) { this.data.delete(key) }
}

assert.equal(canTransitionTroubleshooting('idle', 'assessing'), true)
assert.equal(canTransitionTroubleshooting('assessing', 'resolved'), false)
assert.equal(canTransitionTroubleshooting('verifying', 'resolved'), true)
assert.equal(canTransitionTroubleshooting('blocked', 'assessing'), true)

const storage = new MemoryStorage()
const sessions = Array.from({ length: 55 }, (_, index) => ({
  id: `issue-${index}`,
  conversationId: `conv-${index}`,
  hostId: 'host-1',
  hostName: 'demo',
  summary: `issue ${index}`,
  state: 'assessing',
  evidenceRecordIds: [],
  actionCount: 0,
  modelRoundCount: 0,
  createdAt: index,
  updatedAt: index,
}))
saveTroubleshootingSessions(storage, sessions)
const loaded = loadTroubleshootingSessions(storage)
assert.equal(loaded.length, 50)
assert.equal(loaded[0].id, 'issue-54')

storage.setItem(TROUBLESHOOTING_STORAGE_KEY, JSON.stringify([{ ...sessions[0], summary: 'token=secret-value' }]))
assert.doesNotMatch(loadTroubleshootingSessions(storage)[0].summary, /secret-value/)
console.log('Troubleshooting session checks passed')
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node --experimental-strip-types scripts/test-troubleshooting-session.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/troubleshooting-session.ts`.

- [ ] **Step 3: Add the pure model and bounded persistence**

Create `src/utils/troubleshooting-session.ts` with these exact public types and rules:

```ts
import { redactOperationText } from './operation-records.ts'

export const TROUBLESHOOTING_STORAGE_KEY = 'ai-troubleshooting-sessions-v1'
export const MAX_TROUBLESHOOTING_SESSIONS = 50
export const MAX_AGENT_ACTIONS = 12
export const MAX_AGENT_MODEL_ROUNDS = 8

export type TroubleshootingState =
  | 'idle' | 'assessing' | 'collecting' | 'awaiting_authorization'
  | 'executing' | 'verifying' | 'resolved' | 'blocked' | 'cancelled'

export interface TroubleshootingSession {
  id: string
  conversationId: string
  hostId: string
  hostName: string
  summary: string
  state: TroubleshootingState
  facts?: string[]
  evidenceRecordIds: string[]
  actionCount: number
  modelRoundCount: number
  lastError?: string
  createdAt: number
  updatedAt: number
}

const transitions: Record<TroubleshootingState, TroubleshootingState[]> = {
  idle: ['assessing', 'cancelled'],
  assessing: ['collecting', 'awaiting_authorization', 'blocked', 'cancelled'],
  collecting: ['awaiting_authorization', 'executing', 'assessing', 'blocked', 'cancelled'],
  awaiting_authorization: ['executing', 'assessing', 'blocked', 'cancelled'],
  executing: ['verifying', 'assessing', 'blocked', 'cancelled'],
  verifying: ['resolved', 'assessing', 'blocked', 'cancelled'],
  resolved: ['assessing', 'cancelled'],
  blocked: ['assessing', 'cancelled'],
  cancelled: ['assessing'],
}

export function canTransitionTroubleshooting(from: TroubleshootingState, to: TroubleshootingState): boolean {
  return from === to || transitions[from].includes(to)
}
```

Implement `sanitizeTroubleshootingSession`, `loadTroubleshootingSessions`, and `saveTroubleshootingSessions` so every free-text field passes through `redactOperationText`, arrays are capped at 20 items, sessions sort by `updatedAt` descending, and only the newest 50 persist.

- [ ] **Step 4: Add the Pinia wrapper**

Create `src/stores/troubleshooting.ts` with the following public API:

```ts
export const useTroubleshootingStore = defineStore('troubleshooting', () => {
  const sessions = ref<TroubleshootingSession[]>([])
  const byConversation = (conversationId: string) =>
    sessions.value.find(item => item.conversationId === conversationId) || null
  function startOrResume(input: { conversationId: string; hostId: string; hostName: string; summary: string }): TroubleshootingSession
  function setState(conversationId: string, state: TroubleshootingState, error?: string): boolean
  function addEvidence(conversationId: string, operationRecordId: string): void
  function incrementAction(conversationId: string): boolean
  function incrementModelRound(conversationId: string): boolean
  function deleteByConversation(conversationId: string): void
  function clearAll(): void
  function init(): void
  return { sessions, byConversation, startOrResume, setState, addEvidence, incrementAction, incrementModelRound, deleteByConversation, clearAll, init }
})
```

`incrementAction` returns `false` after 12 actions; `incrementModelRound` returns `false` after 8 rounds. Invalid state transitions return `false` without mutating the task.

- [ ] **Step 5: Initialize the store and register the test command**

At the import section of `src/main.ts`, add:

```ts
import { useTroubleshootingStore } from '@/stores/troubleshooting'
```

Then, after `chatStore.init()`, add:

```ts
const troubleshootingStore = useTroubleshootingStore()
troubleshootingStore.init()
```

In `package.json` add:

```json
"test:troubleshooting-session": "node --experimental-strip-types scripts/test-troubleshooting-session.mjs"
```

- [ ] **Step 6: Run focused test, build, and startup check**

Run:

```powershell
npm run test:troubleshooting-session
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: test prints `Troubleshooting session checks passed`; build exits 0; Vite prints a local URL with no compile error. Stop the development server after the ready line.

- [ ] **Step 7: Commit the task**

```powershell
git add package.json src/main.ts src/utils/troubleshooting-session.ts src/stores/troubleshooting.ts scripts/test-troubleshooting-session.mjs
git commit -m "feat: persist ai troubleshooting sessions"
```

---

### Task 2: Bounded and Redacted Agent Context

**Files:**
- Create: `src/utils/agent-context.ts`
- Create: `scripts/test-agent-context.mjs`
- Modify: `package.json:6-24`

**Interfaces:**
- Consumes: `OperationRecord`, `PermissionLevel`, `TroubleshootingSession`.
- Produces: `AgentContextSnapshot`, `buildAgentContext(input)`, and `formatAgentContext(snapshot)`.

- [ ] **Step 1: Write the failing context-selection test**

Create `scripts/test-agent-context.mjs`:

```js
import assert from 'node:assert/strict'
import { buildAgentContext, formatAgentContext } from '../src/utils/agent-context.ts'

const operations = Array.from({ length: 12 }, (_, index) => ({
  id: `op-${index}`,
  source: 'terminal',
  serverId: index === 11 ? 'other' : 'host-1',
  serverName: 'demo',
  command: index === 1 ? 'curl -H "Authorization: Bearer secret-token" https://example.com' : `echo ${index}`,
  cwd: '/root',
  output: index === 2 ? `password=hidden\n${'x'.repeat(6000)}` : `output ${index}`,
  exitCode: index === 3 ? 1 : 0,
  timedOut: false,
  truncated: false,
  status: index === 3 ? 'failed' : 'success',
  startedAt: index,
}))

const snapshot = buildAgentContext({
  capturedAt: 100,
  host: { id: 'host-1', name: 'demo', address: '10.0.0.1', port: 22, username: 'root', connectionStatus: 'connected' },
  workspace: { view: 'terminal', cwd: '/root' },
  operations,
  permissionLevel: 'controlled',
  activeIssue: null,
})
const prompt = formatAgentContext(snapshot)
assert.equal(snapshot.recentOperations.length, 8)
assert.ok(snapshot.recentOperations.some(item => item.id === 'op-3'))
assert.ok(snapshot.recentOperations.every(item => item.serverId === 'host-1'))
assert.doesNotMatch(prompt, /secret-token|password=hidden/)
assert.ok(snapshot.recentOperations.every(item => item.output.length <= 4096))
assert.ok(prompt.length <= 24 * 1024)
console.log('Agent context checks passed')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --experimental-strip-types scripts/test-agent-context.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/agent-context.ts`.

- [ ] **Step 3: Implement context selection and formatting**

Create `src/utils/agent-context.ts` with:

```ts
export const MAX_AGENT_CONTEXT_TEXT = 24 * 1024
export const MAX_AGENT_CONTEXT_OPERATIONS = 8
export const MAX_AGENT_OPERATION_OUTPUT = 4 * 1024

export type AgentWorkspaceView = 'terminal' | 'files' | 'logs' | 'ops' | 'scripts' | 'history' | 'unknown'

export interface AgentContextSnapshot {
  capturedAt: number
  host: { id: string; name: string; address: string; port: number; username: string; connectionStatus: string; sessionGeneration?: number } | null
  workspace: { view: AgentWorkspaceView; cwd?: string; selectedPath?: string; selectedScriptId?: string }
  recentOperations: Array<Pick<OperationRecord, 'id' | 'source' | 'serverId' | 'serverName' | 'command' | 'cwd' | 'output' | 'stderr' | 'exitCode' | 'timedOut' | 'truncated' | 'status' | 'startedAt'>>
  activeIssue: Pick<TroubleshootingSession, 'id' | 'summary' | 'state' | 'facts' | 'lastError'> | null
  permission: { level: PermissionLevel }
}

export interface BuildAgentContextInput {
  capturedAt?: number
  host: AgentContextSnapshot['host']
  workspace: AgentContextSnapshot['workspace']
  operations: OperationRecord[]
  activeIssue: TroubleshootingSession | null
  permissionLevel: PermissionLevel
}
```

Selection algorithm: filter to `host.id`; sort newest first; reserve up to three slots for newest `failed`, `interrupted`, or `timedOut` records; fill remaining slots with newest records; deduplicate by ID; cap at eight. Sanitize command, cwd, output, stderr, host labels, issue summary, facts, and errors with `redactOperationText`; add explicit regex replacement for Cookie, database URLs, `AKIA[0-9A-Z]{16}`, and common `*_SECRET`/`*_TOKEN` assignments.

`formatAgentContext` emits a deterministic `=== 当前运维上下文（系统自动采集） ===` block. If formatting exceeds 24 KB, repeatedly remove the oldest operation; if only one remains, shorten its output until the final string fits.

- [ ] **Step 4: Register and run the focused test**

Add to `package.json`:

```json
"test:agent-context": "node --experimental-strip-types scripts/test-agent-context.mjs"
```

Run:

```powershell
npm run test:agent-context
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: test prints `Agent context checks passed`; build exits 0; Vite starts without compile errors. Stop it after the ready line.

- [ ] **Step 5: Commit the task**

```powershell
git add package.json src/utils/agent-context.ts scripts/test-agent-context.mjs
git commit -m "feat: assemble bounded ai operations context"
```

---

### Task 3: Structured Actions and Streaming-Safe Display

**Files:**
- Create: `src/utils/agent-response.ts`
- Create: `scripts/test-agent-response.mjs`
- Modify: `package.json:6-25`

**Interfaces:**
- Consumes: raw model response chunks.
- Produces: `AgentAction`, `AgentResponse`, `parseAgentResponse(content)`, and `AgentActionStreamFilter`.

- [ ] **Step 1: Write parser and chunk-boundary tests**

Create `scripts/test-agent-response.mjs`:

```js
import assert from 'node:assert/strict'
import { AgentActionStreamFilter, parseAgentResponse } from '../src/utils/agent-response.ts'

const raw = `结论：nginx 未启动。\n<agent_action>{"id":"a1","kind":"command","command":"systemctl status nginx --no-pager","purpose":"读取状态","verifyCommand":"systemctl is-active nginx"}</agent_action>`
const parsed = parseAgentResponse(raw)
assert.equal(parsed.actions.length, 1)
assert.equal(parsed.actions[0].command, 'systemctl status nginx --no-pager')
assert.doesNotMatch(parsed.displayMarkdown, /agent_action/)

const legacy = parseAgentResponse('检查日志\n<execute_command>journalctl -u nginx -n 80 --no-pager</execute_command>')
assert.equal(legacy.actions[0].protocol, 'legacy')
assert.equal(legacy.actions[0].command, 'journalctl -u nginx -n 80 --no-pager')

const malformed = parseAgentResponse('说明\n<agent_action>{bad json}</agent_action>')
assert.equal(malformed.actions.length, 0)
assert.match(malformed.displayMarkdown, /说明/)

const filter = new AgentActionStreamFilter()
const visible = [
  filter.push('准备检查<agent_'),
  filter.push('action>{"id":"a1","kind":"command","command":"uptime","purpose":"check"}</agent_action>完成'),
  filter.finish(),
].join('')
assert.equal(visible, '准备检查完成')
console.log('Agent response checks passed')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --experimental-strip-types scripts/test-agent-response.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the tolerant response parser**

Create `src/utils/agent-response.ts` with these exact types:

```ts
export interface AgentAction {
  id: string
  kind: 'command'
  command: string
  purpose: string
  verifyCommand?: string
  protocol: 'structured' | 'legacy'
}

export interface AgentResponse {
  displayMarkdown: string
  status: 'informational' | 'needs_action' | 'resolved' | 'blocked'
  conclusion?: string
  evidence: string[]
  actions: AgentAction[]
}
```

`parseAgentResponse` must:

- parse each `<agent_action>JSON</agent_action>` independently;
- accept only `kind === 'command'`, non-empty `command`, and non-empty `purpose`;
- assign `action-${index + 1}` when ID is absent;
- parse every legacy `<execute_command>` as a command action with purpose `执行模型请求的诊断命令`;
- remove valid and malformed machine blocks from `displayMarkdown`;
- derive status as `needs_action` when actions exist, `resolved` when the visible reply contains `已解决` or `问题解决`, `blocked` when it contains `无法继续` or `受阻`, otherwise `informational`;
- extract at most five lines beginning with `证据：`, `- 证据` or `* 证据`.

- [ ] **Step 4: Implement a stream filter that never reveals machine blocks**

`AgentActionStreamFilter` keeps an internal buffer and hidden-tag state. `push(chunk)` returns only safe visible text; it recognizes opening and closing tags split across chunks for both protocols. When no tag is open, retain the last 20 characters if they are a prefix of either opening tag. `finish()` drops an unterminated machine block rather than showing it.

Use these constants so tests and implementation share exact delimiters:

```ts
const ACTION_OPEN = '<agent_action>'
const ACTION_CLOSE = '</agent_action>'
const LEGACY_OPEN = '<execute_command>'
const LEGACY_CLOSE = '</execute_command>'
```

- [ ] **Step 5: Register, test, build, and check startup**

Add to `package.json`:

```json
"test:agent-response": "node --experimental-strip-types scripts/test-agent-response.mjs"
```

Run:

```powershell
npm run test:agent-response
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: focused test passes, build exits 0, and Vite starts without errors. Stop the server after the ready line.

- [ ] **Step 6: Commit the task**

```powershell
git add package.json src/utils/agent-response.ts scripts/test-agent-response.mjs
git commit -m "feat: parse structured ai actions"
```

---

### Task 4: Authorized Execution and Verification Coordinator

**Files:**
- Create: `src/utils/agent-execution.ts`
- Create: `scripts/test-agent-execution-core.mjs`
- Modify: `package.json:6-26`

**Interfaces:**
- Consumes: `AgentAction` and caller-supplied authorization/SSH callbacks.
- Produces: `CommandAuthorization`, `AgentCommandResult`, `AgentActionResult`, `formatAgentCommandResult()`, and `executeAgentAction()`.

- [ ] **Step 1: Write authorization, retry, and verification tests**

Create `scripts/test-agent-execution-core.mjs`:

```js
import assert from 'node:assert/strict'
import { executeAgentAction } from '../src/utils/agent-execution.ts'

const action = { id: 'a1', kind: 'command', command: 'systemctl restart nginx', purpose: 'restart', verifyCommand: 'systemctl is-active nginx', protocol: 'structured' }

let runs = 0
const denied = await executeAgentAction(action, {
  authorize: async () => ({ allowed: false, denialMessage: 'blocked' }),
  run: async () => { runs++; throw new Error('must not run') },
})
assert.equal(denied.status, 'denied')
assert.equal(runs, 0)

const states = []
const commands = []
const completed = []
let firstAttempt = true
const success = await executeAgentAction(action, {
  authorize: async () => ({ allowed: true, denialMessage: '', auditId: 'audit-1' }),
  run: async (command) => {
    commands.push(command)
    if (firstAttempt) {
      firstAttempt = false
      return { stdout: '', stderr: 'channel closed', exitCode: null, timedOut: false, channelError: true }
    }
    return { stdout: command.includes('is-active') ? 'active' : '', stderr: '', exitCode: 0, timedOut: false, channelError: false }
  },
  onState: state => states.push(state),
  onCompleted: (command, result) => completed.push([command, result.formatted]),
})
assert.equal(success.status, 'verified')
assert.deepEqual(commands, ['systemctl restart nginx', 'systemctl restart nginx', 'systemctl is-active nginx'])
assert.deepEqual(states, ['awaiting_authorization', 'executing', 'verifying'])
assert.equal(completed.length, 2)
console.log('Agent execution core checks passed')
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --experimental-strip-types scripts/test-agent-execution-core.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement result formatting and one-action execution**

Create `src/utils/agent-execution.ts` with:

```ts
import type { AgentAction } from './agent-response.ts'
import type { TroubleshootingState } from './troubleshooting-session.ts'

export interface CommandAuthorization {
  allowed: boolean
  auditId?: string
  denialMessage: string
}

export interface AgentCommandResult {
  stdout: string
  stderr: string
  exitCode: number | null
  timedOut: boolean
  channelError: boolean
  startedAt?: number
  finishedAt?: number
  formatted?: string
}

export interface AgentActionResult {
  action: AgentAction
  status: 'denied' | 'failed' | 'completed' | 'verified' | 'verification_failed'
  commandResult?: Required<AgentCommandResult>
  verificationResult?: Required<AgentCommandResult>
  denialMessage?: string
}

export interface AgentExecutionDependencies {
  authorize(command: string): Promise<CommandAuthorization>
  run(command: string): Promise<AgentCommandResult>
  onState?(state: TroubleshootingState): void
  onCompleted?(command: string, result: Required<AgentCommandResult>, authorization: CommandAuthorization, verification: boolean): void
}
```

`formatAgentCommandResult` returns a normalized object and follows these exact semantics:

- timeout: preserve available stdout/stderr and append a bounded-command hint;
- no output with exit 0: `[命令执行完毕，退出码 0，无输出]`;
- nonzero exit: append `[退出码 N — 命令本身返回错误]`;
- `channelError`: prefix `[执行错误]`;
- success is `!channelError && !timedOut && exitCode === 0`.

Missing timestamps are filled when the coordinator starts and finishes the call, so every normalized result has `startedAt`, `finishedAt`, and a non-negative duration can be derived by the operation-record caller.

`executeAgentAction` authorizes every primary and verification command, retries a command once only when `channelError === true`, calls `onCompleted` once per logical command after retry, and runs verification only after a successful primary command.

- [ ] **Step 4: Register, test, build, and check startup**

Add:

```json
"test:agent-execution-core": "node --experimental-strip-types scripts/test-agent-execution-core.mjs"
```

Run:

```powershell
npm run test:agent-execution-core
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: all three commands succeed or reach the Vite ready line without compile errors; stop Vite after readiness.

- [ ] **Step 5: Commit the task**

```powershell
git add package.json src/utils/agent-execution.ts scripts/test-agent-execution-core.mjs
git commit -m "feat: coordinate authorized ai actions"
```

---

### Task 5: Prompt Composition and Context-Aware Tool Loop

**Files:**
- Create: `src/utils/agent-prompt.ts`
- Modify: `src/utils/ai-chat.ts:1-430`
- Modify: `src/stores/agent.ts:35-139`
- Modify: `scripts/verify-agent-execution.mjs`

**Interfaces:**
- Consumes: `AgentContextSnapshot`, `AgentAction`, and `executeAgentAction`.
- Produces: `buildAgentSystemPrompt()`, an extended `streamChat(..., contextSnapshot?, onStateChange?)`, and structured result callbacks.

- [ ] **Step 1: Extend the existing regression check before implementation**

Append these assertions to `scripts/verify-agent-execution.mjs`:

```js
const agentPrompt = readFileSync(resolve(root, 'src/utils/agent-prompt.ts'), 'utf8')
const responseParser = readFileSync(resolve(root, 'src/utils/agent-response.ts'), 'utf8')
const executionCore = readFileSync(resolve(root, 'src/utils/agent-execution.ts'), 'utf8')
assert(aiChat.includes('buildAgentSystemPrompt'), 'AI chat must compose stable rules and bounded dynamic context')
assert(aiChat.includes('parseAgentResponse'), 'AI chat must parse structured and legacy actions')
assert(aiChat.includes('AgentActionStreamFilter'), 'machine action blocks must not leak into visible streaming text')
assert(aiChat.includes('executeAgentAction'), 'AI chat must use the shared execution coordinator')
assert(agentPrompt.includes('formatAgentContext'), 'prompt composer must include the redacted context snapshot')
assert(responseParser.includes('<execute_command>'), 'legacy command protocol must remain supported')
assert(executionCore.includes('channelError'), 'connection-level retry must use structured error state')
```

- [ ] **Step 2: Run the regression check and verify it fails on missing wiring**

Run: `npm run test:agent-execution`

Expected: FAIL because `src/utils/agent-prompt.ts` is absent or the new imports are not wired.

- [ ] **Step 3: Add the prompt composer**

Create `src/utils/agent-prompt.ts`:

```ts
export interface AgentPromptInput {
  basePrompt: string
  locale: string
  mode: AgentMode
  context: AgentContextSnapshot | null
  canExecute: boolean
}

export function buildAgentSystemPrompt(input: AgentPromptInput): string {
  const language = input.locale === 'zh-CN'
    ? '所有结论、证据、操作说明和错误信息使用简体中文。'
    : 'Respond in English.'
  const execution = input.canExecute
    ? `Use <agent_action>{"id":"action-1","kind":"command","command":"...","purpose":"...","verifyCommand":"optional read-only verification"}</agent_action> for server commands. Never ask the user to copy commands or paste output. Collect bounded read-only evidence first. Every state change requires verification. Empty output is not a disconnected session.`
    : 'Do not emit agent_action or execute_command blocks. Provide advice and command examples only.'
  return [language, input.basePrompt, execution, input.context ? formatAgentContext(input.context) : '当前没有连接服务器。'].join('\n\n')
}
```

Reduce the `ops` agent prompt in `src/stores/agent.ts` to stable role, evidence-first, safety, and concise-answer rules. Remove duplicated server details and command-protocol paragraphs now owned by the composer. Keep the exact Chinese prohibitions against asking the user to execute commands manually.

- [ ] **Step 4: Replace ad-hoc tool parsing and execution in `ai-chat.ts`**

Make these signature changes while retaining existing argument order:

```ts
export type { CommandAuthorization } from './agent-execution'

export async function streamChat(
  agent: Agent,
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
  serverContext?: ServerContext | null,
  sessionId?: string | null,
  onToolStart?: (command: string) => void,
  mode?: AgentMode,
  onAuthorizeCommand?: (command: string) => Promise<CommandAuthorization>,
  onCommandCompleted?: (command: string, result: Required<AgentCommandResult>, authorization: CommandAuthorization, verification: boolean) => void,
  contextSnapshot?: AgentContextSnapshot | null,
  onStateChange?: (state: TroubleshootingState, error?: string) => void,
): Promise<StreamControl>
```

Replace `parseToolCalls`, `stripToolCalls`, `formatExecResult`, and string-only `executeCommand` with imports from the new modules. The Tauri runner returns:

```ts
return {
  stdout: result.stdout || '',
  stderr: result.stderr || '',
  exitCode: result.exit_code,
  timedOut: result.timed_out,
  channelError: false,
}
```

The catch branch returns `channelError: true`, `exitCode: null`, and the real error text in `stderr`.

- [ ] **Step 5: Filter machine blocks while preserving raw response parsing**

For each model round, keep `fullContent` from raw chunks and pass only `filter.push(chunk)` to `onChunk`. After the request finishes, append `filter.finish()`, then call `parseAgentResponse(fullContent)`. Execute `response.actions` sequentially through `executeAgentAction`.

Add internal evidence messages using:

```ts
function actionResultForModel(result: AgentActionResult): string {
  const primary = result.commandResult?.formatted || result.denialMessage || '[没有执行结果]'
  const verification = result.verificationResult?.formatted
  return [
    `[系统行动结果 id=${result.action.id} status=${result.status}]`,
    `命令：${result.action.command}`,
    `结果：\n${primary}`,
    verification ? `验证命令：${result.action.verifyCommand}\n验证结果：\n${verification}` : '',
    '请基于真实结果继续分析；不要重复已经成功的命令。',
  ].filter(Boolean).join('\n\n')
}
```

These internal results go into the local request message array only; do not call `chatStore.addUserMessage` for them.

- [ ] **Step 6: Enforce loop limits and state callbacks**

Set `MAX_TOOL_ROUNDS` to `MAX_AGENT_MODEL_ROUNDS`. Count actions and stop after `MAX_AGENT_ACTIONS`; emit a final internal instruction summarizing evidence and call `onStateChange('blocked', '已达到本次任务的安全执行上限')`. Use `assessing`, `collecting`, `awaiting_authorization`, `executing`, `verifying`, `resolved`, and `blocked` callbacks at their actual transitions.

- [ ] **Step 7: Run focused regressions, build, and startup check**

Run:

```powershell
npm run test:agent-response
npm run test:agent-execution-core
npm run test:agent-execution
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: regression scripts pass; build exits 0; Vite starts without compile errors. Stop it after the ready line.

- [ ] **Step 8: Commit the task**

```powershell
git add src/utils/agent-prompt.ts src/utils/ai-chat.ts src/stores/agent.ts scripts/verify-agent-execution.mjs
git commit -m "feat: run context-aware ai troubleshooting loop"
```

---

### Task 6: Wire Context, Task State, and Operation Evidence into AI Chat

**Files:**
- Modify: `src/components/AiChat.vue:190-970`
- Modify: `src/views/SettingsView.vue:300-490`
- Modify: `src/i18n/zh-CN.json:350-440`
- Modify: `src/i18n/en.json:350-440`
- Create: `scripts/verify-ai-agent-2.mjs`
- Modify: `package.json:6-27`

**Interfaces:**
- Consumes: all modules created in Tasks 1-5 plus `useOperationRecordsStore`, `useRoute`, and the current SSH store.
- Produces: context-aware sends, persisted task state, AI operation records, compact state text, and complete data cleanup.

- [ ] **Step 1: Write the source-wiring regression check**

Create `scripts/verify-ai-agent-2.mjs`:

```js
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
```

- [ ] **Step 2: Run the wiring test and verify it fails**

Run: `node scripts/verify-ai-agent-2.mjs`

Expected: FAIL on the first missing `buildAgentContext` or troubleshooting-store assertion.

- [ ] **Step 3: Assemble context at send time**

In `AiChat.vue`, import and initialize:

```ts
const route = useRoute()
const troubleshootingStore = useTroubleshootingStore()
const operationRecordsStore = useOperationRecordsStore()

function workspaceView(): AgentWorkspaceView {
  if (route.path.includes('script')) return 'scripts'
  if (route.path.includes('history')) return 'history'
  if (route.path.includes('file')) return 'files'
  if (route.path.includes('ops')) return 'ops'
  return 'terminal'
}
```

After `chatStore.addUserMessage`, call `startOrResume` only when the active agent is `ops` and mode is `agent`. Build the snapshot from current host, current route, current task, `operationRecordsStore.getEntries(activeHost.id)`, and `opsAgentStore.permissionLevel`. Pass the snapshot and state callback as the final two `streamChat` arguments.

Extract this assembly into `currentAgentContext()` inside `AiChat.vue` and use it for both ordinary sends and the separate quick-analysis `streamChat` call. File, script, terminal, logs, services, and inspection injections already enter through these two send paths, so they receive the same bounded context without duplicating their visible user cards.

- [ ] **Step 4: Record every completed AI command once**

Change `handleCommandCompleted` to accept the structured result and verification flag:

```ts
function handleCommandCompleted(command: string, result: Required<AgentCommandResult>, authorization: CommandAuthorization, verification: boolean) {
  if (authorization.auditId) opsAgentStore.completeAudit(authorization.auditId, result.formatted)
  const task = activeConv.value ? troubleshootingStore.byConversation(activeConv.value.id) : null
  const record = operationRecordsStore.addRecord({
    source: 'ai',
    serverId: activeHost.value.id,
    serverName: activeHost.value.name,
    sessionId: sshStore.activeSession?.realSessionId,
    command,
    output: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    status: result.channelError || (result.exitCode !== null && result.exitCode !== 0) ? 'failed' : 'success',
    startedAt: result.startedAt,
    finishedAt: result.finishedAt,
    durationMs: result.finishedAt - result.startedAt,
  })
  if (task) troubleshootingStore.addEvidence(task.conversationId, record.id)
  if (!verification && task) troubleshootingStore.incrementAction(task.conversationId)
}
```

Do not insert a second visible user message for the result.

Update `runRemediationCommand` to normalize its `sshExecFull` result into the same `AgentCommandResult` shape before calling `handleCommandCompleted`. During `handleStartRemediation`, move the task through `assessing` and `collecting`; during plan execution use `awaiting_authorization`, `executing`, and `verifying`; finish as `resolved` or `blocked`. This preserves the existing conservative remediation plan while making it visible through the same task state and operation evidence.

- [ ] **Step 5: Keep task lifecycle aligned with conversation lifecycle**

- `handleDeleteConv(id)` calls `troubleshootingStore.deleteByConversation(id)` after deleting the conversation.
- `handleNewChat()` cancels the old active task before creating a new empty conversation, but does not delete its history.
- `handleStop()` moves the active task to `cancelled` while retaining evidence.
- SSH status watchers never clear or recreate tasks.

Display a single text status near the assistant name:

```vue
<span v-if="activeTask && activeTask.state !== 'idle'" class="agent-task-status">
  {{ t(`ai.taskState.${activeTask.state}`) }}
</span>
```

Add localized labels for all nine states. Style the label with existing muted text variables, no filled card, no animation, and no new permanent icon.

- [ ] **Step 6: Add backup and deletion ownership**

Add `ai-troubleshooting-sessions-v1` to the `aiHistory` keys in `SettingsView.vue`. Initialize `useTroubleshootingStore()` there and call `troubleshootingStore.clearAll()` in both AI/history category clearing and all-data clearing.

The existing recursive backup sanitizer remains the export boundary; do not export credentials or a context snapshot.

- [ ] **Step 7: Register and run tests, build, and startup check**

Add:

```json
"test:ai-agent-2": "node scripts/verify-ai-agent-2.mjs"
```

Run:

```powershell
npm run test:troubleshooting-session
npm run test:agent-context
npm run test:agent-response
npm run test:agent-execution-core
npm run test:agent-execution
npm run test:ai-agent-2
npm run test:operation-records
npm run test:ops-permissions
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: every script passes, the build exits 0, and Vite reaches ready state with no startup or compilation error. Stop it after readiness.

- [ ] **Step 8: Commit the task**

```powershell
git add package.json src/components/AiChat.vue src/views/SettingsView.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-ai-agent-2.mjs
git commit -m "feat: connect ai chat to troubleshooting context"
```

---

### Task 7: Full Regression and Realistic Fault-Flow Verification

**Files:**
- Modify: `scripts/verify-ai-agent-2.mjs`
- Modify: `docs/superpowers/specs/2026-08-21-ai-agent-2-design.md` only if implementation revealed a factual mismatch; otherwise leave the spec unchanged.

**Interfaces:**
- Consumes: the completed first-stage agent pipeline.
- Produces: a reproducible verification gate covering all first-stage acceptance criteria.

- [ ] **Step 1: Add static acceptance assertions**

Extend `scripts/verify-ai-agent-2.mjs` with checks that:

```js
const aiChat = readFileSync(resolve(root, 'src/utils/ai-chat.ts'), 'utf8')
const prompt = readFileSync(resolve(root, 'src/utils/agent-prompt.ts'), 'utf8')
const context = readFileSync(resolve(root, 'src/utils/agent-context.ts'), 'utf8')
assert.ok(prompt.includes('Never ask the user to copy commands or paste output'))
assert.ok(prompt.includes('Empty output is not a disconnected session'))
assert.ok(aiChat.includes('MAX_AGENT_MODEL_ROUNDS'))
assert.ok(aiChat.includes('MAX_AGENT_ACTIONS'))
assert.ok(context.includes('MAX_AGENT_CONTEXT_TEXT = 24 * 1024'))
assert.ok(context.includes('MAX_AGENT_OPERATION_OUTPUT = 4 * 1024'))
```

- [ ] **Step 2: Run every project regression script**

Run:

```powershell
npm run test:operation-records
npm run test:agent-execution
npm run test:ops-permissions
npm run test:ops-remediation
npm run test:ops-orchestration
npm run test:ops-runbooks
npm run test:ssh-terminal-reliability
npm run test:local-data-management
npm run test:session-tab-reordering
npm run test:terminal-focus-layout
npm run test:terminal-colorizer
npm run test:terminal-global-search
npm run test:ui-refresh
npm run test:troubleshooting-session
npm run test:agent-context
npm run test:agent-response
npm run test:agent-execution-core
npm run test:ai-agent-2
```

Expected: every command exits 0. Fix regressions in the task that introduced them; do not weaken old assertions to hide missing behavior.

- [ ] **Step 3: Run production build and startup-error check**

Run:

```powershell
npm run build
npm run dev -- --host 127.0.0.1
```

Expected: Vite build completes with no TypeScript or Vue compilation errors; development server reaches ready state with no startup exception. Stop it after readiness.

- [ ] **Step 4: Manually exercise the first-stage flow in the running app**

Use a connected test server and perform these bounded checks:

1. Ask “检查当前服务器负载” and verify the agent knows the current host without asking again.
2. Approve a read-only command and verify its output becomes one operation record and one evidence reference, not a duplicate user message.
3. Run `true` and verify the agent interprets it as successful with no output.
4. Trigger a bounded timeout and verify partial output plus timeout guidance appears instead of “connection lost”.
5. Let SSH reconnect, reopen the right panel, and verify the same conversation and task state remain.
6. Reject a change action and verify the task returns to analysis or becomes accurately blocked without repeatedly asking.
7. Inspect the model request through development logging only long enough to confirm it contains no password, private-key block, Authorization value, cookie, or token; remove the temporary logging before commit.

- [ ] **Step 5: Review the final diff for scope and secrets**

Run:

```powershell
git diff --check
git status --short
git diff --stat
rg -n "BEGIN .*PRIVATE KEY|Bearer [A-Za-z0-9]|password=[^[]|token=[^[]" src scripts docs/superpowers/plans/2026-08-21-ai-agent-2-core.md
```

Expected: no whitespace errors, no credential material, and only intended AI Agent 2.0 files are modified. The pre-existing untracked `npm` path remains untouched.

- [ ] **Step 6: Commit the verification gate**

```powershell
git add scripts/verify-ai-agent-2.mjs
git commit -m "test: verify ai agent troubleshooting flow"
```

- [ ] **Step 7: Push the completed first-stage commits**

```powershell
git push origin main
```

Expected: `main` advances on `origin` with all seven task commits and no installer artifacts.
