# 本地工作流快照与数据管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不增加主界面复杂度的前提下，提供本地、脱敏的工作流快照以及可分类清理的业务数据管理。

**Architecture:** 前端以独立的 Pinia `workflowSnapshots` store 管理脱敏快照，沿用 WebView 的 localStorage 持久化和现有 JSON 备份格式。设置页负责展示分类计数、导入导出和删除确认；Rust 后端仅提供不暴露明文的加密凭据清理命令。快照从命令历史和 AI 对话的按需菜单创建，执行入口复用当前终端命令注入与 AI 上下文注入。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、Tauri 2、Rust、serde、Node 静态回归脚本。

## Global Constraints

- 所有业务数据默认仅存储在当前设备；不增加云同步、账户或遥测。
- 快照和备份不得包含密码、私钥正文、API Token 或其加密内容。
- 清除全部业务数据必须删除服务器资料、加密私钥、AI Token、快照、历史及业务记录，但保留主题、语言、终端偏好和窗口布局。
- 设置页保持单列分类和按需展开；不得新增侧栏入口、数据库浏览器或仪表盘。
- 不打包 EXE，除非用户明确要求。
- 每项完成后至少运行对应回归、`npm run build`、`cargo test`，并执行桌面启动检查。

---

## File structure

- Create: `src/stores/workflowSnapshots.ts` — 快照模型、脱敏、CRUD、导入导出和计数。
- Create: `scripts/verify-local-data-management.mjs` — 快照脱敏、数据清理、备份边界和 UI 接线的静态回归。
- Modify: `src/stores/commandHistory.ts` — 对外暴露按 ID 获取命令，供快照构造器使用。
- Modify: `src/stores/chat.ts` — 对外暴露按 ID 获取已完成对话消息，供快照构造器使用。
- Modify: `src/components/AiChat.vue` — 在已完成的命令/输出上下文菜单添加“保存为快照”。
- Modify: `src/views/CommandHistoryView.vue` — 在单条命令操作菜单添加“保存为快照”。
- Modify: `src/views/SettingsView.vue` — 增加极简数据类别、快照入口、导入导出及危险清理确认。
- Modify: `src/api/tauri.ts` — 增加不返回凭据明文的 `clearSensitiveLocalData` 包装。
- Modify: `src-tauri/src/storage/mod.rs` — 提供删除 token 和整个加密私钥目录的原子化维护函数。
- Modify: `src-tauri/src/commands/mod.rs` — 注册 `clear_sensitive_local_data` Tauri 命令。
- Modify: `src-tauri/src/lib.rs` — 将新 Tauri 命令加入 invoke handler。
- Modify: `src/i18n/zh-CN.json` and `src/i18n/en.json` — 增加快照、数据清理、备份和确认文案。
- Modify: `src/views/SettingsView.vue` existing backup key list — 明确只导出非敏感业务键，加入快照键且排除偏好和凭据。

## Task 1: Build the local workflow snapshot domain

**Files:**
- Create: `src/stores/workflowSnapshots.ts`
- Create: `scripts/verify-local-data-management.mjs`
- Modify: `src/stores/commandHistory.ts`
- Modify: `src/stores/chat.ts`

**Interfaces:**
- Consumes: `CommandEntry` from `src/stores/commandHistory.ts` and `ChatMessage` from `src/stores/chat.ts`.
- Produces: `WorkflowSnapshot`, `createSnapshot`, `deleteSnapshot`, `clearSnapshots`, `exportSnapshots`, `importSnapshots`, `getSnapshot`, `snapshotCount`.

- [ ] **Step 1: Write the failing domain regression test**

```js
const snapshots = read('src/stores/workflowSnapshots.ts')
assert.ok(snapshots.includes("const STORAGE_KEY = 'workflow-snapshots'"))
assert.ok(snapshots.includes('function sanitizeSnapshot'))
assert.ok(snapshots.includes('password'))
assert.ok(snapshots.includes('privateKey'))
assert.ok(snapshots.includes('function clearSnapshots'))
assert.ok(snapshots.includes('function exportSnapshots'))
assert.ok(snapshots.includes('function importSnapshots'))
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `node scripts/verify-local-data-management.mjs`

Expected: FAIL because `workflowSnapshots.ts` does not exist.

- [ ] **Step 3: Implement the smallest complete snapshot store**

```ts
export interface WorkflowSnapshot {
  id: string
  title: string
  createdAt: number
  server?: { id: string; name: string }
  commands: Array<{ command: string; output?: string; timestamp?: number }>
  aiSummary?: string
  filePaths: string[]
  tags: string[]
}

function sanitizeSnapshot(input: WorkflowSnapshot): WorkflowSnapshot {
  const stripSensitive = (value: string) => value
    .replace(/(password|passphrase|token|api[_-]?key)\s*[:=]\s*\S+/gi, '$1: [REDACTED]')
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
  return { ...input, commands: input.commands.map(item => ({ ...item, command: stripSensitive(item.command), output: item.output ? stripSensitive(item.output) : undefined })) }
}
```

Persist only sanitized objects in `workflow-snapshots`; cap retained entries at 200 and reject malformed import payloads.

- [ ] **Step 4: Add focused accessors to existing stores**

```ts
function getEntry(id: string): CommandEntry | null {
  return entries.value.find(entry => entry.id === id) || null
}

function getConversation(id: string): Conversation | null {
  return conversations.value.find(conversation => conversation.id === id) || null
}
```

Export these accessors without changing their existing persistence behavior.

- [ ] **Step 5: Run the domain regression test and build**

Run: `npm run test:local-data-management && npm run build`

Expected: both commands exit 0.

- [ ] **Step 6: Commit the domain layer**

```bash
git add src/stores/workflowSnapshots.ts src/stores/commandHistory.ts src/stores/chat.ts scripts/verify-local-data-management.mjs
git commit -m "feat: add local workflow snapshots"
```

## Task 2: Add minimal snapshot creation and reuse actions

**Files:**
- Modify: `src/components/AiChat.vue`
- Modify: `src/views/CommandHistoryView.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: `useWorkflowSnapshotsStore().createSnapshot(input)` from Task 1 and existing `sshStore.runInTerminal(command)` / AI context injection providers.
- Produces: a compact “保存为快照” action for one completed command or AI result, plus reusable command actions from a snapshot view.

- [ ] **Step 1: Extend the regression test for UI wiring**

```js
const chat = read('src/components/AiChat.vue')
const history = read('src/views/CommandHistoryView.vue')
assert.ok(chat.includes('saveAsSnapshot'))
assert.ok(history.includes('saveAsSnapshot'))
assert.ok(zhLocale.includes('"saveSnapshot"'))
assert.ok(enLocale.includes('"saveSnapshot"'))
```

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `npm run test:local-data-management`

Expected: FAIL because neither UI exposes `saveAsSnapshot`.

- [ ] **Step 3: Add compact save actions without new always-visible controls**

```ts
function saveAsSnapshot(command: string, output?: string) {
  snapshots.createSnapshot({
    title: command.slice(0, 48),
    server: activeServer ? { id: activeServer.id, name: activeServer.name } : undefined,
    commands: [{ command, output, timestamp: Date.now() }],
    filePaths: [],
    tags: [],
  })
  ElMessage.success(t('data.snapshotSaved'))
}
```

Put the action in existing per-message/per-command menus only. Do not add a toolbar button or modal unless the user chooses to edit title/tags.

- [ ] **Step 4: Add snapshot list/reuse panel in the Settings data section**

Use the existing collapsible `data` section. Render a compact list only when the user clicks “工作流快照”; each row has title, server, time, command count, and a three-dot menu with “导入终端”, “发送给 AI”, “删除”. Use the first command for one-click import.

- [ ] **Step 5: Add bilingual copy**

```json
{
  "data": {
    "snapshots": "工作流快照",
    "saveSnapshot": "保存为快照",
    "snapshotSaved": "已保存到本机",
    "importToTerminal": "导入终端",
    "sendToAi": "发送给 AI"
  }
}
```

Use semantically matching English keys and preserve existing locale nesting conventions.

- [ ] **Step 6: Verify the actions and build**

Run: `npm run test:local-data-management && npm run build`

Expected: both commands exit 0 and no snapshot action is rendered as a permanent primary button.

- [ ] **Step 7: Commit the UI actions**

```bash
git add src/components/AiChat.vue src/views/CommandHistoryView.vue src/views/SettingsView.vue src/i18n/zh-CN.json src/i18n/en.json scripts/verify-local-data-management.mjs
git commit -m "feat: add workflow snapshot actions"
```

## Task 3: Add safe category cleanup and backup boundaries

**Files:**
- Modify: `src/views/SettingsView.vue`
- Modify: `src/stores/workflowSnapshots.ts`
- Modify: `src/api/tauri.ts`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: `clearSnapshots()` from Task 1, existing store persistence keys, and `clearSensitiveLocalData()` from Task 4.
- Produces: `clearDataCategory(category)` and `clearAllBusinessData()` with exact scopes and confirmation requirements.

- [ ] **Step 1: Add failing cleanup and backup tests**

```js
const settings = read('src/views/SettingsView.vue')
assert.ok(settings.includes('const BUSINESS_DATA_KEYS'))
assert.ok(settings.includes('function clearDataCategory'))
assert.ok(settings.includes('function clearAllBusinessData'))
assert.ok(settings.includes("inputValue: ''"))
assert.ok(settings.includes("inputPattern: /^清除$/"))
assert.ok(!settings.includes("'color-scheme'"))
assert.ok(!settings.includes("'terminal-settings'"))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:local-data-management`

Expected: FAIL because data categories and the typed confirmation are absent.

- [ ] **Step 3: Define explicit non-sensitive backup and cleanup maps**

```ts
const BACKUP_KEYS = [
  'ssh-servers', 'ssh-groups', 'ssh-quick-commands', 'command-history',
  'ai-chat-conversations', 'workflow-snapshots', 'script-automation-scripts',
  'script-automation-schedules', 'script-automation-run-logs',
]

const BUSINESS_DATA_KEYS = {
  snapshots: ['workflow-snapshots'],
  chat: ['ai-chat-conversations'],
  history: ['command-history'],
  connections: ['ssh-servers', 'ssh-groups', 'ssh-quick-commands'],
  other: ['script-automation-scripts', 'script-automation-schedules', 'script-automation-run-logs'],
} as const
```

Use each existing store's `clear` function when mounted; remove only the listed localStorage keys for inactive stores. Do not remove `color-scheme`, `terminal-settings`, language, focus layout or window preferences.

- [ ] **Step 4: Implement typed dangerous confirmation**

```ts
await ElMessageBox.prompt(
  t('data.clearAllDescription'),
  t('data.clearAll'),
  { inputValue: '', inputPattern: /^清除$/, inputErrorMessage: t('data.typeClear') },
)
```

After confirmation, clear every category, call `clearSensitiveLocalData()`, reload stores, and show one concise success message. A failure from one category must identify that category and must not restore data already deleted.

- [ ] **Step 5: Verify cleanup and backup constraints**

Run: `npm run test:local-data-management && npm run build`

Expected: both commands exit 0; test confirms exported data excludes preference and credential keys.

- [ ] **Step 6: Commit the frontend data management flow**

```bash
git add src/views/SettingsView.vue src/stores/workflowSnapshots.ts src/api/tauri.ts src/i18n/zh-CN.json src/i18n/en.json scripts/verify-local-data-management.mjs
git commit -m "feat: add local data cleanup controls"
```

## Task 4: Delete encrypted local credentials through the backend

**Files:**
- Modify: `src-tauri/src/storage/mod.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `scripts/verify-local-data-management.mjs`

**Interfaces:**
- Consumes: application data directory from `AppHandle` and existing `delete_token` / encrypted `ssh-keys` storage.
- Produces: `storage::clear_sensitive_local_data(app_data_dir: &Path) -> AppResult<()>` and Tauri command `clear_sensitive_local_data(app: AppHandle) -> AppResult<()>`.

- [ ] **Step 1: Add a failing Rust test and command registration assertion**

```rust
#[test]
fn clear_sensitive_data_removes_token_and_key_vault() {
    let dir = env::temp_dir().join("tauri-ai-clear-sensitive-data");
    let _ = fs::remove_dir_all(&dir);
    save_token(&dir, "sk-test").unwrap();
    save_ssh_private_key(&dir, "test-key", "-----BEGIN PRIVATE KEY-----\nkey\n-----END PRIVATE KEY-----").unwrap();
    clear_sensitive_local_data(&dir).unwrap();
    assert!(!token_path(&dir).exists());
    assert!(!dir.join("ssh-keys").exists());
}
```

Add static assertions that `clear_sensitive_local_data` is implemented, exposed by `commands`, and registered in `lib.rs`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test clear_sensitive_data_removes_token_and_key_vault && npm run test:local-data-management`

Expected: FAIL because the storage function and command do not exist.

- [ ] **Step 3: Implement the backend deletion boundary**

```rust
pub fn clear_sensitive_local_data(app_data_dir: &Path) -> AppResult<()> {
    delete_token(app_data_dir)?;
    let key_dir = app_data_dir.join("ssh-keys");
    if key_dir.exists() {
        fs::remove_dir_all(key_dir)?;
    }
    Ok(())
}

#[tauri::command]
pub fn clear_sensitive_local_data(app: AppHandle) -> AppResult<()> {
    let data_dir = app.path().app_data_dir().map_err(|error| {
        AppError::with_source(ErrorCode::IoError, "获取app_data_dir失败", error.to_string())
    })?;
    storage::clear_sensitive_local_data(&data_dir)
}
```

The command must not read, return, log or serialize any token/private-key plaintext.

- [ ] **Step 4: Register and expose the command**

Add `commands::clear_sensitive_local_data` to `tauri::generate_handler![]` and add this frontend wrapper:

```ts
export async function clearSensitiveLocalData(): Promise<void> {
  return invoke<void>('clear_sensitive_local_data')
}
```

- [ ] **Step 5: Run backend and frontend checks**

Run: `cargo test && npm run test:local-data-management && npm run build`

Expected: all commands exit 0.

- [ ] **Step 6: Commit backend credential cleanup**

```bash
git add src-tauri/src/storage/mod.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs src/api/tauri.ts scripts/verify-local-data-management.mjs
git commit -m "feat: clear local encrypted credentials"
```

## Task 5: Full verification and delivery

**Files:**
- Modify: `scripts/verify-local-data-management.mjs` only if a missing assertion is discovered during verification.

**Interfaces:**
- Consumes: all interfaces from Tasks 1–4.
- Produces: verified, startup-safe local workflow snapshot and data management feature.

- [ ] **Step 1: Run all relevant regression checks**

Run:

```bash
npm run test:local-data-management
npm run test:ssh-terminal-reliability
npm run test:agent-execution
npm run test:ui-refresh
npm run build
```

Expected: each command exits 0. Record existing non-blocking Vite chunk-size warnings separately from failures.

- [ ] **Step 2: Run Rust verification**

Run: `cargo test && cargo build`

Expected: all Rust tests and build exit 0.

- [ ] **Step 3: Run desktop startup health check**

Run:

```powershell
$process = Start-Process -FilePath (Resolve-Path 'target\\debug\\aiterminal.exe') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 8
if (-not (Get-Process -Id $process.Id -ErrorAction SilentlyContinue)) { throw 'AITerminal exited during startup health check.' }
Stop-Process -Id $process.Id -ErrorAction SilentlyContinue
```

Expected: application remains running for the health check.

- [ ] **Step 4: Review changed files and commit verification adjustments if needed**

```bash
git diff --check
git status --short
git add <only files changed by verification fixes>
git commit -m "test: verify local data management"
```

Do not add untracked `npm` files or build artifacts.

- [ ] **Step 5: Push completed commits**

Run: `git push origin main`

Expected: remote `main` advances with the implementation commits.

## Plan self-review

- Spec coverage: Tasks 1–2 implement local, manually saved, sanitized snapshots and per-command reuse; Task 3 implements category cleanup, full cleanup, backup boundaries and preference retention; Task 4 deletes encrypted private keys and Token without exposing plaintext; Task 5 verifies startup and regressions.
- Placeholder scan: no unresolved placeholders or deferred implementation steps are present.
- Type consistency: Task 1 defines `WorkflowSnapshot` and all Task 2–3 calls use `createSnapshot`, `clearSnapshots`, `exportSnapshots`, and `importSnapshots`; Task 4 defines `clearSensitiveLocalData` for Task 3.
