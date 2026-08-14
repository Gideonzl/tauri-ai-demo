# SSH Session Health and Seamless Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep idle SSH terminals usable by detecting stale transports, rebuilding SSH and PTY state automatically, and showing recovery UI only when the process is slow or fails.

**Architecture:** Add a pure TypeScript health-state model, store that model on each in-memory Pinia session, and let `SSHShellSession` coordinate checks, recovery, and queued input. Rust exposes bounded health-check and idempotent recovery commands built on the existing connection config, keepalive, PTY-size tracking, and status-event channel. `TerminalPanel` maps state to the existing compact toolbar without adding a new page or persistent control.

**Tech Stack:** Vue 3, TypeScript, Pinia, Tauri 2, Rust, russh, Node.js assertion tests, Vite.

## Global Constraints

- Normal connected state must add no persistent button or status text; retain only the existing green dot.
- A check or recovery message appears only after 1,000 ms.
- Successful recovery feedback disappears after approximately 2,000 ms.
- A manual reconnect action appears only after automatic recovery reaches `failed`.
- Health checks must not run a remote shell command or write to terminal output.
- Recovery must preserve the existing frontend session ID, tab order, terminal scrollback, active selection, and PTY dimensions.
- Recovery must never silently create `DemoSession` for a real SSH session.
- Health state is memory-only and must not be added to persisted server profiles.
- Automatic recovery performs at most two attempts and must not loop on missing sessions, missing configuration, or authentication failure.
- Do not package an `.exe` as part of this plan.

---

## File Structure

- Create `src/utils/session-health.ts` — pure health state transitions, idle-check decision, and delayed visibility rules.
- Create `scripts/test-session-health.mjs` — runtime tests for the pure health model plus structural integration assertions.
- Modify `src/stores/ssh.ts` — attach memory-only health state and focused store actions to each `SshSession`.
- Modify `src-tauri/src/protocol/ssh/mod.rs` — bounded channel probe, per-session recovery lock, and idempotent transport/PTY recovery.
- Modify `src-tauri/src/commands/mod.rs` — expose `ssh_check_session` and `ssh_recover_session` commands.
- Modify `src-tauri/src/lib.rs` — register both new Tauri commands.
- Modify `src/api/tauri.ts` — typed wrappers used by the interactive terminal session.
- Modify `src/sessions/SSHShellSession.ts` — single-flight checks/recovery, status/activity callbacks, and ordered input.
- Modify `src/components/TerminalPanel.vue` — Pinia synchronization, focus/idle checks, delayed minimal recovery UI, and manual retry.
- Modify `src/i18n/zh-CN.json` and `src/i18n/en.json` — recovery-only status and action labels.
- Modify `scripts/verify-ssh-terminal-reliability.mjs` — enforce backend and UI recovery invariants.
- Modify `package.json` — add `test:session-health`.

### Task 1: Pure health model and Pinia session state

**Files:**
- Create: `src/utils/session-health.ts`
- Create: `scripts/test-session-health.mjs`
- Modify: `src/stores/ssh.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `SshHealthState`, `SshSessionHealth`, `createSessionHealth(now?)`, `reduceSessionHealth(health, event, now?)`, `shouldCheckSession(health, now?, idleMs?)`, and `shouldRevealHealthState(health, now?, delayMs?)`.
- Produces store actions: `markSessionActivity(sessionId, at?)`, `applySessionHealthEvent(sessionId, event, at?)`.
- Consumes no Tauri or Vue component APIs, so the model can be tested directly with Node.

- [ ] **Step 1: Write the failing model test**

Create `scripts/test-session-health.mjs`:

```js
import assert from 'node:assert/strict'
import {
  createSessionHealth,
  reduceSessionHealth,
  shouldCheckSession,
  shouldRevealHealthState,
} from '../src/utils/session-health.ts'

let health = createSessionHealth(1_000)
assert.equal(health.state, 'healthy')
assert.equal(health.reconnectCount, 0)
assert.equal(shouldCheckSession(health, 60_999), false)
assert.equal(shouldCheckSession(health, 61_000), true)

health = reduceSessionHealth(health, { type: 'check-started' }, 61_000)
assert.equal(health.state, 'checking')
assert.equal(shouldRevealHealthState(health, 61_999), false)
assert.equal(shouldRevealHealthState(health, 62_000), true)

health = reduceSessionHealth(health, { type: 'recovery-started', reason: 'stale transport' }, 62_000)
health = reduceSessionHealth(health, { type: 'recovery-succeeded' }, 62_500)
assert.equal(health.state, 'healthy')
assert.equal(health.reconnectCount, 1)
assert.equal(health.recoveredAt, 62_500)

health = reduceSessionHealth(health, { type: 'recovery-started', reason: 'network lost' }, 70_000)
health = reduceSessionHealth(health, { type: 'recovery-failed', reason: 'authentication rejected' }, 71_000)
assert.equal(health.state, 'failed')
assert.equal(health.reason, 'authentication rejected')

console.log('Session health model checks passed')
```

- [ ] **Step 2: Add the test command and verify RED**

Add to `package.json`:

```json
"test:session-health": "node --experimental-strip-types scripts/test-session-health.mjs"
```

Run: `npm run test:session-health`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/utils/session-health.ts`.

- [ ] **Step 3: Implement the minimal pure model**

Create `src/utils/session-health.ts` with explicit event types and immutable transitions:

```ts
export type SshHealthState = 'healthy' | 'checking' | 'recovering' | 'failed'

export interface SshSessionHealth {
  state: SshHealthState
  lastActivityAt: number
  lastCheckedAt?: number
  stateChangedAt: number
  recoveryStartedAt?: number
  recoveredAt?: number
  reconnectCount: number
  reason?: string
}

export type SshHealthEvent =
  | { type: 'activity' }
  | { type: 'check-started' }
  | { type: 'check-succeeded' }
  | { type: 'recovery-started'; reason?: string }
  | { type: 'recovery-succeeded' }
  | { type: 'recovery-failed'; reason: string }

export function createSessionHealth(now = Date.now()): SshSessionHealth {
  return { state: 'healthy', lastActivityAt: now, stateChangedAt: now, reconnectCount: 0 }
}

export function shouldCheckSession(health: SshSessionHealth, now = Date.now(), idleMs = 60_000): boolean {
  return health.state === 'healthy' && now - health.lastActivityAt >= idleMs
}

export function shouldRevealHealthState(health: SshSessionHealth, now = Date.now(), delayMs = 1_000): boolean {
  return (health.state === 'checking' || health.state === 'recovering') && now - health.stateChangedAt >= delayMs
}
```

Implement `reduceSessionHealth` so activity updates only `lastActivityAt`, checks set `lastCheckedAt`, recovery success increments once, and failure preserves its reason.

- [ ] **Step 4: Run the model test to verify GREEN**

Run: `npm run test:session-health`

Expected: PASS and print `Session health model checks passed`.

- [ ] **Step 5: Extend the Pinia session model**

In `src/stores/ssh.ts`:

```ts
import {
  createSessionHealth,
  reduceSessionHealth,
  type SshHealthEvent,
  type SshSessionHealth,
} from '@/utils/session-health'

export interface SshSession {
  id: string
  serverId: string
  serverName: string
  status: SshStatus
  createdAt: number
  error?: string
  realSessionId?: string
  health: SshSessionHealth
}
```

Initialize `health: createSessionHealth()` in `createSession`. Add actions:

```ts
function markSessionActivity(sessionId: string, at = Date.now()) {
  applySessionHealthEvent(sessionId, { type: 'activity' }, at)
}

function applySessionHealthEvent(sessionId: string, event: SshHealthEvent, at = Date.now()) {
  const session = sessions.value.find(item => item.id === sessionId)
  if (!session) return
  session.health = reduceSessionHealth(session.health, event, at)
}
```

Return both actions from the store. Do not include health in `saveToStorage`.

- [ ] **Step 6: Add structural assertions and rerun**

Append to `scripts/test-session-health.mjs`:

```js
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = file => readFileSync(resolve(root, file), 'utf8')
const sshStore = read('src/stores/ssh.ts')
assert.match(sshStore, /health:\s*createSessionHealth\(\)/)
assert.match(sshStore, /function markSessionActivity/)
assert.match(sshStore, /function applySessionHealthEvent/)
```

Run: `npm run test:session-health`

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- package.json scripts/test-session-health.mjs src/utils/session-health.ts src/stores/ssh.ts
git commit -m "feat: model SSH session health"
```

### Task 2: Bounded Rust health check and idempotent recovery

**Files:**
- Modify: `src-tauri/src/protocol/ssh/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/api/tauri.ts`
- Modify: `scripts/test-session-health.mjs`
- Modify: `scripts/verify-ssh-terminal-reliability.mjs`

**Interfaces:**
- Produces Rust `check_session(session_id: &str) -> AppResult<()>`.
- Produces Rust `recover_shell_session(app: AppHandle, session_id: &str) -> AppResult<()>`.
- Produces Tauri commands `ssh_check_session` and `ssh_recover_session`.
- Produces TypeScript wrappers `sshCheckSession(sessionId): Promise<void>` and `sshRecoverSession(sessionId): Promise<void>`.
- Consumes the existing `SESSIONS`, `take_session_handle`, `restore_session_handle`, `reconnect_session`, `open_shell`, saved `pty_size`, and `ssh-status` event.

- [ ] **Step 1: Add failing structural assertions**

Append assertions to `scripts/test-session-health.mjs`:

```js
const protocol = read('src-tauri/src/protocol/ssh/mod.rs')
const commands = read('src-tauri/src/commands/mod.rs')
const lib = read('src-tauri/src/lib.rs')
const api = read('src/api/tauri.ts')

assert.match(protocol, /pub async fn check_session/)
assert.match(protocol, /tokio::time::timeout\(std::time::Duration::from_secs\(3\)/)
assert.match(protocol, /RECOVERY_LOCKS/)
assert.match(protocol, /pub async fn recover_shell_session/)
assert.match(commands, /pub async fn ssh_check_session/)
assert.match(commands, /pub async fn ssh_recover_session/)
assert.match(lib, /commands::ssh_check_session/)
assert.match(lib, /commands::ssh_recover_session/)
assert.match(api, /export async function sshCheckSession/)
assert.match(api, /export async function sshRecoverSession/)
```

- [ ] **Step 2: Run to verify RED**

Run: `npm run test:session-health`

Expected: FAIL because the Rust and API recovery symbols do not exist.

- [ ] **Step 3: Implement the bounded probe**

In `src-tauri/src/protocol/ssh/mod.rs`, add a 3-second channel-open probe that always restores the shared handle:

```rust
pub async fn check_session(session_id: &str) -> AppResult<()> {
    let handle = take_session_handle(session_id).await?;
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        handle.channel_open_session(),
    )
    .await;
    restore_session_handle(session_id, handle).await?;

    match result {
        Ok(Ok(channel)) => {
            channel.close().await.ok();
            Ok(())
        }
        Ok(Err(error)) => Err(AppError::new(
            ErrorCode::SshChannelOpenFailed,
            format!("Session check failed: {}", error),
        )),
        Err(_) => Err(AppError::new(
            ErrorCode::SshSessionTimeout,
            "Session check timed out",
        )),
    }
}
```

- [ ] **Step 4: Implement per-session recovery serialization**

Add a lazy map of per-session mutexes:

```rust
static RECOVERY_LOCKS: Lazy<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
```

Implement `recover_shell_session` to acquire the session-specific lock, return immediately when the current `cmd_tx` exists and is not closed, emit `reconnecting`, and try `reconnect_session + open_shell` at most twice. Sleep 500 ms before the second attempt. Emit `error` with the final message and return the final `AppError` after both attempts. Missing sessions return immediately without retry.

Replace the private `reconnect_shell_session` call in `write_to_shell` with the shared public recovery function so keyboard fallback and explicit recovery use one path.

- [ ] **Step 5: Expose Tauri commands and TypeScript wrappers**

Add to `src-tauri/src/commands/mod.rs`:

```rust
#[tauri::command]
pub async fn ssh_check_session(session_id: String) -> AppResult<()> {
    ssh::check_session(&session_id).await
}

#[tauri::command]
pub async fn ssh_recover_session(app: AppHandle, session_id: String) -> AppResult<()> {
    ssh::recover_shell_session(app, &session_id).await
}
```

Register both in `src-tauri/src/lib.rs`. Add to `src/api/tauri.ts`:

```ts
export async function sshCheckSession(sessionId: string): Promise<void> {
  return invoke<void>('ssh_check_session', { sessionId })
}

export async function sshRecoverSession(sessionId: string): Promise<void> {
  return invoke<void>('ssh_recover_session', { sessionId })
}
```

- [ ] **Step 6: Run focused tests and Rust checks**

Run:

```powershell
npm run test:session-health
npm run test:ssh-terminal-reliability
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: all exit 0. Fix compiler ownership errors without weakening the timeout, handle restoration, two-attempt limit, or per-session lock.

- [ ] **Step 7: Commit**

```powershell
git add -- scripts/test-session-health.mjs scripts/verify-ssh-terminal-reliability.mjs src-tauri/src/protocol/ssh/mod.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/api/tauri.ts
git commit -m "feat: add bounded SSH session recovery"
```

### Task 3: Session coordinator and ordered input

**Files:**
- Modify: `src/sessions/SSHShellSession.ts`
- Modify: `scripts/test-session-health.mjs`

**Interfaces:**
- Consumes `sshCheckSession`, `sshRecoverSession`, `sshWrite`, and existing SSH event subscriptions.
- Produces constructor callbacks `onStatus?: (status, error?) => void` and `onActivity?: () => void`.
- Produces methods `checkHealth(): Promise<void>` and `recover(reason?: string): Promise<void>`.
- Guarantees one in-flight maintenance promise and ordered input delivery.

- [ ] **Step 1: Add failing coordinator assertions**

Append to `scripts/test-session-health.mjs`:

```js
const shellSession = read('src/sessions/SSHShellSession.ts')
assert.match(shellSession, /private maintenance: Promise<void> \| null = null/)
assert.match(shellSession, /async checkHealth\(\): Promise<void>/)
assert.match(shellSession, /async recover\(reason\?: string\): Promise<void>/)
assert.match(shellSession, /sshCheckSession\(this\.sessionId\)/)
assert.match(shellSession, /sshRecoverSession\(this\.sessionId\)/)
assert.match(shellSession, /this\.onActivity\?\.\(\)/)
```

- [ ] **Step 2: Run to verify RED**

Run: `npm run test:session-health`

Expected: FAIL because the coordinator methods and fields do not exist.

- [ ] **Step 3: Add callbacks and single-flight maintenance**

Extend the constructor with an options object:

```ts
interface SSHShellSessionOptions {
  onStatus?: (status: string, error?: string) => void
  onActivity?: () => void
}
```

Store callbacks and add:

```ts
private maintenance: Promise<void> | null = null

private runMaintenance(work: () => Promise<void>): Promise<void> {
  if (this.maintenance) return this.maintenance
  const current = work().finally(() => {
    if (this.maintenance === current) this.maintenance = null
  })
  this.maintenance = current
  return current
}
```

Add a private `performRecovery(reason?: string)` that calls `sshRecoverSession`. `checkHealth` must run `sshCheckSession` inside `runMaintenance`; on failure it calls `performRecovery` directly inside the same maintenance task. The public `recover` wraps `performRecovery` with `runMaintenance`. Do not call public `recover` from inside `runMaintenance`, because awaiting the currently active maintenance promise would deadlock. Both public methods reject to the caller after callbacks receive the final status.

- [ ] **Step 4: Preserve ordered input and activity events**

Before each `sshWrite`, await `this.maintenance` when present. Continue to use `writeQueue` so keystrokes remain ordered. Call `onActivity` after a successful write and whenever SSH output arrives. Forward every backend `ssh-status` event through `onStatus` before deciding whether the session should be destroyed.

Do not destroy the session for `reconnecting`. Destroy only for a final explicit `disconnected`; for `error`, retain the frontend object so the manual retry button can reuse it.

- [ ] **Step 5: Run focused tests**

Run:

```powershell
npm run test:session-health
npm run test:ssh-terminal-reliability
```

Expected: both PASS.

- [ ] **Step 6: Commit**

```powershell
git add -- scripts/test-session-health.mjs src/sessions/SSHShellSession.ts
git commit -m "feat: coordinate SSH recovery and input"
```

### Task 4: Minimal delayed recovery UI and focus checks

**Files:**
- Modify: `src/components/TerminalPanel.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/test-session-health.mjs`
- Modify: `scripts/verify-ssh-terminal-reliability.mjs`

**Interfaces:**
- Consumes the health store actions, `shouldCheckSession`, `shouldRevealHealthState`, and `SSHShellSession.checkHealth/recover`.
- Produces no new page; uses the existing `.tbar` status area.
- Produces localized keys `terminal.checkingConnection`, `terminal.restoringConnection`, `terminal.connectionRestored`, `terminal.reconnect`, and `terminal.recoveryFailed`.

- [ ] **Step 1: Add failing UI assertions**

Append to `scripts/test-session-health.mjs`:

```js
const terminalPanel = read('src/components/TerminalPanel.vue')
const zh = read('src/i18n/zh-CN.json')
const en = read('src/i18n/en.json')
assert.match(terminalPanel, /window\.addEventListener\('focus', onWindowFocus\)/)
assert.match(terminalPanel, /shouldCheckSession/)
assert.match(terminalPanel, /health-visible/)
assert.match(terminalPanel, /manual-reconnect/)
assert.match(terminalPanel, /@click="retryRecovery"/)
for (const key of ['checkingConnection', 'restoringConnection', 'connectionRestored', 'reconnect', 'recoveryFailed']) {
  assert.ok(zh.includes(`"${key}"`))
  assert.ok(en.includes(`"${key}"`))
}
```

- [ ] **Step 2: Run to verify RED**

Run: `npm run test:session-health`

Expected: FAIL because focus checks and recovery UI are absent.

- [ ] **Step 3: Synchronize callbacks to Pinia**

Construct `SSHShellSession` with callbacks bound to the panel's own `props.session.id`:

```ts
const options = {
  onActivity: () => sshStore.markSessionActivity(props.session!.id),
  onStatus: (nextStatus: string, error?: string) => handleBackendStatus(nextStatus, error),
}
```

Map `connected` to `updateSessionStatus(..., 'connected')` plus `recovery-succeeded` only when the previous health state was recovering. Map `reconnecting` to `recovery-started` and start `session.recover(error)` without blocking terminal rendering. Map final `error` to `failed` and keep the terminal buffer untouched.

- [ ] **Step 4: Add focus/idle health checks**

Add `onWindowFocus` that returns unless this is the active real SSH panel, the session object exists, and `shouldCheckSession(session.health)` is true. Apply `check-started`, call `SSHShellSession.checkHealth`, then apply `check-succeeded` or let recovery callbacks update state. Register on mount and remove on unmount.

Prevent duplicate focus checks with the session coordinator's single-flight maintenance promise.

- [ ] **Step 5: Add delayed minimal status rendering**

Use one 250 ms UI tick only while state is `checking` or `recovering`; compute visibility with `shouldRevealHealthState`. Render:

```vue
<span v-if="healthMessage" class="health-visible">{{ healthMessage }}</span>
<button
  v-if="sessionHealth?.state === 'failed'"
  class="manual-reconnect"
  type="button"
  @click="retryRecovery"
>{{ t('terminal.reconnect') }}</button>
```

When healthy, `healthMessage` must be empty. After recovery success, set a transient local `restoredUntil = Date.now() + 2_000`; display `connectionRestored` until the deadline, then remove the text. Style both elements as compact text within the existing toolbar, with theme tokens and no box shadow or floating overlay.

- [ ] **Step 6: Add bilingual labels**

Chinese:

```json
"checkingConnection": "正在检查连接…",
"restoringConnection": "正在恢复连接…",
"connectionRestored": "连接已恢复",
"reconnect": "重新连接",
"recoveryFailed": "连接恢复失败"
```

English:

```json
"checkingConnection": "Checking connection…",
"restoringConnection": "Restoring connection…",
"connectionRestored": "Connection restored",
"reconnect": "Reconnect",
"recoveryFailed": "Connection recovery failed"
```

- [ ] **Step 7: Run focused tests and build**

Run:

```powershell
npm run test:session-health
npm run test:ssh-terminal-reliability
npm run build
```

Expected: all exit 0. The build may retain existing chunk-size or VueUse annotation warnings, but must have no TypeScript, Vue template, or Sass error.

- [ ] **Step 8: Commit**

```powershell
git add -- scripts/test-session-health.mjs scripts/verify-ssh-terminal-reliability.mjs src/components/TerminalPanel.vue src/i18n/zh-CN.json src/i18n/en.json
git commit -m "feat: show minimal SSH recovery state"
```

### Task 5: Full regression and startup verification

**Files:**
- Modify only files required to fix regressions caused by Tasks 1–4.

**Interfaces:**
- Consumes all completed feature interfaces.
- Produces a verified feature with no startup error and no packaging artifact.

- [ ] **Step 1: Run the complete frontend regression set**

Run:

```powershell
npm run test:session-health
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

- [ ] **Step 2: Run Rust verification**

Run:

```powershell
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: exit 0 with no compile error.

- [ ] **Step 3: Start a dedicated development server and inspect startup output**

Start `npm run dev -- --port 1422 --strictPort` as a hidden background process, capture stdout/stderr to task-specific temporary files, and wait only until Vite reports ready or exits.

Expected:

- Vite reports a local URL on port 1422.
- Stderr contains no compile or startup error.
- No existing application process is stopped.

- [ ] **Step 4: Inspect the running UI**

Open the local URL in the in-app browser. Verify:

- The application shell renders without a Vite error overlay.
- The terminal workspace opens without raw locale keys.
- Normal disconnected/demo state has no recovery button.
- Theme contrast remains readable in the existing light and dark schemes.

Close only the browser tab opened for this check and stop only the dedicated Vite PID from Step 3.

- [ ] **Step 5: Verify repository state and commit any regression fix**

Run:

```powershell
git diff --check
git status -sb
```

Expected: only the pre-existing untracked `npm` entry remains. If regression fixes were necessary, commit only their explicit paths:

```powershell
git commit -m "fix: stabilize SSH recovery integration"
```

- [ ] **Step 6: Push the verified commits**

Run:

```powershell
git push origin main
```

Expected: `main -> main` succeeds. Do not run Tauri bundling or produce an `.exe`.
