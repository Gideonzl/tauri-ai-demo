# Independent Operation Records Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record each interactive terminal command with its output and metadata, then provide minimal per-record actions for AI analysis, rerun, recipe saving, copying, and deletion.

**Architecture:** A framework-free terminal capture state machine turns PTY input/output into completed operation drafts. A pure persistence utility sanitizes and migrates records, while a small Pinia store exposes them to TerminalPanel and CommandHistoryView. Xterm decorations are optional presentation; recording remains functional when decoration rendering is unavailable.

**Tech Stack:** Vue 3, TypeScript, Pinia, xterm.js 6, Node.js 26 type stripping, Element Plus, Vite.

## Global Constraints

- Do not change remote shell profiles, `PROMPT_COMMAND`, or user environment.
- Do not add a new first-level route, permanent side panel, cloud synchronization, approval flow, or package dependency.
- Interactive PTY exit codes remain `null`; UI says “completed” without claiming exit code 0.
- Retain at most 200 records and the final 32 KB of output per record.
- Sending output to AI is always initiated by an explicit user click.
- Keep legacy `cmd-history` readable for one version and do not delete it during migration.
- Do not package an installer in this phase.

---

## File Map

- Create `src/utils/operation-records.ts`: record types, redaction, normalization, migration and size limits.
- Create `src/utils/terminal-command-capture.ts`: PTY input/output capture state machine.
- Create `src/stores/operationRecords.ts`: Pinia state and local persistence facade.
- Create `scripts/test-operation-records.mjs`: behavioral tests against real TypeScript utilities.
- Modify `src/components/TerminalPanel.vue`: connect input/output streams to the capture state machine.
- Modify `src/frontends/XTermFrontend.ts`: optional per-record AI decoration.
- Modify `src/views/CommandHistoryView.vue`: minimal expandable record list and five actions.
- Modify `src/views/MainLayout.vue`: ensure terminal-to-AI injection opens the AI panel.
- Modify `src/views/SettingsView.vue`: include operation records in backup, statistics and clearing.
- Modify `src/i18n/zh-CN.json` and `src/i18n/en.json`: operation record copy.
- Modify `scripts/verify-local-data-management.mjs`: integration wiring assertions.
- Modify `package.json`: add `test:operation-records`.

---

### Task 1: Pure Record Model and Persistence Rules

**Files:**
- Create: `src/utils/operation-records.ts`
- Create: `scripts/test-operation-records.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `OperationRecord`, `OperationRecordInput`, `sanitizeOperationRecord(input)`, `loadOperationRecords(storage)`, `saveOperationRecords(storage, records)`, `formatOperationForAi(record)`.
- Consumes: only the Web Storage shape `Pick<Storage, 'getItem' | 'setItem'>`; no Vue or browser globals at module load time.

- [ ] **Step 1: Write failing model, redaction and migration tests**

Create `scripts/test-operation-records.mjs` with a small memory storage implementation and assertions:

```js
import assert from 'node:assert/strict'
import {
  OPERATION_RECORDS_KEY,
  loadOperationRecords,
  sanitizeOperationRecord,
  saveOperationRecords,
  formatOperationForAi,
} from '../src/utils/operation-records.ts'

class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, value) }
}

const base = {
  id: 'op-1', source: 'terminal', serverId: 's1', serverName: 'demo',
  command: 'pwd', output: '/root', exitCode: null, timedOut: false,
  truncated: false, status: 'success', startedAt: 100, finishedAt: 125,
}

const redacted = sanitizeOperationRecord({
  ...base,
  command: 'curl -H "Authorization: Bearer secret-token" https://user:pass@example.com',
  output: 'password=abc123\n-----BEGIN RSA PRIVATE KEY-----\nsecret\n-----END RSA PRIVATE KEY-----',
})
assert.doesNotMatch(redacted.command, /secret-token|user:pass/)
assert.doesNotMatch(redacted.output, /abc123|BEGIN RSA PRIVATE KEY/)

const longOutput = sanitizeOperationRecord({ ...base, output: 'x'.repeat(40_000) })
assert.equal(longOutput.output.length, 32 * 1024)
assert.equal(longOutput.truncated, true)

const storage = new MemoryStorage()
storage.setItem('cmd-history', JSON.stringify([{ id: 'old', serverId: 's1', serverName: 'demo', command: 'uptime', timestamp: 50 }]))
const migrated = loadOperationRecords(storage)
assert.equal(migrated[0].command, 'uptime')
assert.equal(migrated[0].status, 'unknown')
assert.equal(migrated[0].output, '')

saveOperationRecords(storage, Array.from({ length: 220 }, (_, index) => ({ ...base, id: `op-${index}`, startedAt: index })))
assert.equal(JSON.parse(storage.getItem(OPERATION_RECORDS_KEY)).length, 200)
assert.match(formatOperationForAi(base), /pwd[\s\S]*\/root/)
```

Add to `package.json`:

```json
"test:operation-records": "node --experimental-strip-types scripts/test-operation-records.mjs"
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:operation-records`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/operation-records.ts`.

- [ ] **Step 3: Implement the minimal pure record utility**

Create the exported types and functions. Use:

```ts
export const OPERATION_RECORDS_KEY = 'operation-records-v1'
export const LEGACY_COMMAND_HISTORY_KEY = 'cmd-history'
export const MAX_OPERATION_RECORDS = 200
export const MAX_OPERATION_OUTPUT = 32 * 1024
```

`sanitizeOperationRecord` must normalize timestamps, trim the command, strip NUL bytes, retain the final 32 KB, and redact private-key blocks, authorization headers, password/token assignments, and URL credentials. `loadOperationRecords` reads the new key first and migrates the legacy array only when the new key is absent. `saveOperationRecords` sanitizes, sorts newest-first, slices to 200, and catches storage errors.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:operation-records`

Expected: PASS and print `Operation record model checks passed`.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/test-operation-records.mjs src/utils/operation-records.ts
git commit -m "feat: add structured operation record model"
```

---

### Task 2: Terminal Command Capture State Machine

**Files:**
- Create: `src/utils/terminal-command-capture.ts`
- Modify: `scripts/test-operation-records.mjs`

**Interfaces:**
- Consumes: `OperationRecordInput` from `operation-records.ts`.
- Produces: `TerminalCommandCapture`, with `submit(command, context)`, `append(data)`, `interrupt()`, `flush()`.

- [ ] **Step 1: Add failing state-machine tests**

Extend the test file:

```js
import { TerminalCommandCapture } from '../src/utils/terminal-command-capture.ts'

const completed = []
let clock = 1000
const capture = new TerminalCommandCapture({ onComplete: record => completed.push(record), now: () => clock })
const context = { serverId: 's1', serverName: 'demo', sessionId: 'real-1', cwd: '/root' }

capture.submit('pwd', context)
clock = 1025
capture.append('pwd\r\n/root\r\nroot@demo:~# ')
assert.equal(completed[0].command, 'pwd')
assert.equal(completed[0].output, '/root')
assert.equal(completed[0].durationMs, 25)
assert.equal(completed[0].status, 'success')

capture.submit('true', context)
capture.append('true\r\nroot@demo:~# ')
assert.equal(completed[1].output, '')

capture.submit('tail -f app.log', context)
capture.append('line 1\r\n')
capture.interrupt()
capture.append('^C\r\nroot@demo:~# ')
assert.equal(completed[2].status, 'interrupted')
assert.match(completed[2].output, /line 1/)

capture.submit('sleep 10', context)
capture.append('\x1b[32mworking\x1b[0m\r\n')
capture.submit('echo next', context)
assert.equal(completed[3].status, 'unknown')
assert.equal(completed[3].output, 'working')

capture.flush()
assert.equal(completed[4].status, 'unknown')
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:operation-records`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `terminal-command-capture.ts`.

- [ ] **Step 3: Implement minimal capture behavior**

Implement a single active record. `interrupt()` sets a pending interrupted status and waits for the following prompt so trailing output is retained. `submit()` finalizes an existing active record as unknown before starting another. `append()` strips ANSI/OSC sequences, removes the echoed command and final prompt at completion, and detects only the latest non-empty line with a conservative `^[^\r\n]{0,160}[$#>%]\s*$` pattern. `flush()` finalizes as unknown.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm run test:operation-records`

Expected: all model and capture assertions PASS.

- [ ] **Step 5: Commit**

```powershell
git add scripts/test-operation-records.mjs src/utils/terminal-command-capture.ts
git commit -m "feat: capture interactive terminal command output"
```

---

### Task 3: Pinia Store and Terminal Wiring

**Files:**
- Create: `src/stores/operationRecords.ts`
- Modify: `src/components/TerminalPanel.vue`
- Modify: `src/frontends/XTermFrontend.ts`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: pure model helpers and `TerminalCommandCapture`.
- Produces: `useOperationRecordsStore()` and `XTermFrontend.addOperationAction(recordId, callback)`.

- [ ] **Step 1: Add failing wiring assertions**

Extend `scripts/verify-local-data-management.mjs` to read the three files and assert:

```js
assert.ok(operationStore.includes('useOperationRecordsStore'), '必须提供统一操作记录 store')
assert.ok(terminalPanel.includes('new TerminalCommandCapture'), '终端必须创建命令捕获器')
assert.ok(terminalPanel.includes('capture.append(data)'), 'PTY 输出必须进入捕获器')
assert.ok(terminalPanel.includes("data === '\\x03'"), 'Ctrl+C 必须结束持续命令记录')
assert.ok(xtermFrontend.includes('addOperationAction'), '终端必须提供可降级的单条 AI 操作装饰')
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:local-data-management`

Expected: FAIL at the first missing operation-record assertion.

- [ ] **Step 3: Implement the Pinia facade**

Create `operationRecords.ts` with `records`, `historyServers`, `addRecord`, `getEntries`, `getRecord`, `deleteRecord`, `clearServer`, `clearAll`, `purgeOrphaned`, and `reload`. Delegate all redaction, limits and migration to the pure utility.

- [ ] **Step 4: Wire capture without changing SSH transport behavior**

In TerminalPanel:

- keep `activeSession.sendInput(data)` as the first terminal behavior;
- replace the old `cmdBuffer` recorder with one `TerminalCommandCapture` per panel;
- on completion, add the record to the store and call `frontend.addOperationAction`;
- inject `sendTerminalToAI` and pass `formatOperationForAi(record)` only after a click;
- call `capture.flush()` before session replacement and unmount;
- do not let capture errors block `frontend.write` or `sendInput`.

In XTermFrontend, register a marker at the current cursor and a right-anchored one-cell decoration. Render a keyboard-accessible button containing `AI`, with CSS variables for contrast. Keep at most 50 live decorations and dispose the oldest. Catch unsupported/alternate-buffer cases and return without error.

- [ ] **Step 5: Run focused tests and build**

Run:

```powershell
npm run test:operation-records
npm run test:local-data-management
npm run test:ssh-terminal-reliability
npm run build
```

Expected: all exit 0; build contains no TypeScript or Vue errors.

- [ ] **Step 6: Commit**

```powershell
git add src/stores/operationRecords.ts src/components/TerminalPanel.vue src/frontends/XTermFrontend.ts scripts/verify-local-data-management.mjs
git commit -m "feat: record terminal command executions"
```

---

### Task 4: Minimal History UI and AI Action

**Files:**
- Modify: `src/views/CommandHistoryView.vue`
- Modify: `src/views/MainLayout.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: operation records store, workflow snapshot store, SSH command injection and `sendTerminalToAI` injection.
- Produces: expandable output and five per-record actions.

- [ ] **Step 1: Add failing UI contract assertions**

Assert that CommandHistoryView contains `expandedRecordId`, `formatOperationForAi`, `sendRecordToAi`, `saveAsSnapshot`, `executeCommand`, `deleteRecord`, and localized status/output keys. Assert that MainLayout opens the AI tab before calling `injectTerminalText`.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:local-data-management`

Expected: FAIL because the history view still uses `useCommandHistoryStore`.

- [ ] **Step 3: Implement the compact record list**

Replace the store import and data access. Keep one-line rows. Add a status dot, optional duration, and a disclosure button. Render output only for `expandedRecordId`. Use a compact action strip inside the expanded area and retain the right-click equivalents. Copy action copies command plus output; snapshot action includes output in `WorkflowSnapshotCommand`.

- [ ] **Step 4: Implement AI panel opening**

Change the existing `sendTerminalToAI` provider in MainLayout to set `rightPanelTab = 'ai'`, expand the panel if collapsed, await `nextTick`, and then call `injectTerminalText`. No auto-send to the model is added beyond the existing injection behavior.

- [ ] **Step 5: Add Chinese and English copy**

Add keys under `history`: title, completed, interrupted, unknown, running, failed, duration, noOutput, legacyNoOutput, outputTruncated, sendToAi, rerun, saveRecipe, copied. Use these keys in the view; remove new hard-coded English strings from the touched UI.

- [ ] **Step 6: Verify and commit**

Run:

```powershell
npm run test:operation-records
npm run test:local-data-management
npm run build
```

Then commit:

```powershell
git add src/views/CommandHistoryView.vue src/views/MainLayout.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-local-data-management.mjs
git commit -m "feat: add per-command history actions"
```

---

### Task 5: Data Management, Regression and Startup Check

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: `useOperationRecordsStore().clearAll()` and storage key `operation-records-v1`.
- Produces: backup, statistics and deletion coverage for operation records.

- [ ] **Step 1: Add failing data-management assertions**

Require `operation-records-v1` in the AI/history category, `operationRecordsStore.clearAll()` in category and full clearing, and the operation records store reload/clear calls.

- [ ] **Step 2: Run the test and verify RED**

Run: `npm run test:local-data-management`

Expected: FAIL because SettingsView does not know the new key/store.

- [ ] **Step 3: Integrate data management**

Add the key to `DATA_CATEGORIES.aiHistory`, instantiate the store, clear it with AI/history and all-business-data actions, and retain `cmd-history` for legacy backup during this version.

- [ ] **Step 4: Run the full verification suite**

Run every project script and build:

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
npm run test:ui-refresh
npm run build
```

Expected: every command exits 0.

- [ ] **Step 5: Check startup errors**

Start a dedicated Vite instance on an unused port, inspect startup output, open `/` and `/history`, and confirm there is no Vite overlay, uncaught startup exception, or missing locale key. Stop only the dedicated process after checking.

- [ ] **Step 6: Commit and push**

```powershell
git add src/views/SettingsView.vue scripts/verify-local-data-management.mjs
git commit -m "feat: manage local operation records"
git push origin main
```

---

## Self-Review Checklist

- The plan covers all design requirements: capture, interruption, unknown fallback, 32 KB truncation, 200-record limit, legacy migration, redaction, AI action, recipe action, data clearing, tests and startup inspection.
- Production behavior is always preceded by a failing automated assertion.
- The terminal decoration is optional and cannot block SSH I/O.
- No task adds a package dependency, new route, permanent panel, cloud feature, approval flow or installer build.
- Interface names are consistent across tasks: `OperationRecord`, `TerminalCommandCapture`, `useOperationRecordsStore`, `formatOperationForAi`, `addOperationAction`.

