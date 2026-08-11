# Terminal Focus Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the SSH workspace to collapse every non-terminal region into a persistent, recoverable terminal-focused layout.

**Architecture:** `MainLayout.vue` owns the application-shell focus state and the top bar/AI panel. `WorkspaceView.vue` owns the host-list, quick-command, and status-bar portions of the workspace. A tiny layout-state utility provides snapshot/restore rules that both views can test without mounting Tauri.

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript, SCSS, Vite SSR regression scripts.

## Global Constraints

- Keep the left navigation icon rail and session tab bar visible in focus mode.
- Do not disconnect or recreate SSH sessions when changing layout.
- Persist focus preference and restore the pre-focus widths/states on exit.
- Do not create a release installer; run only build and startup validation.

---

### Task 1: Layout snapshot utility

**Files:**
- Create: `src/utils/terminalFocusLayout.ts`
- Create: `scripts/verify-terminal-focus-layout.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `createTerminalFocusSnapshot(layout: TerminalFocusLayout): TerminalFocusSnapshot`.
- Produces `restoreTerminalFocusLayout(snapshot: TerminalFocusSnapshot): TerminalFocusLayout`.
- Produces `TERMINAL_FOCUS_STORAGE_KEY = 'terminal-focus-layout'`.

- [ ] **Step 1: Write the failing test**

```js
const layout = { focusMode: false, hostListWidth: 220, hostListCollapsed: false, aiPanelCollapsed: false, quickCommandsCollapsed: false, statusBarHidden: false, topBarHidden: false }
assert.deepEqual(restoreTerminalFocusLayout(createTerminalFocusSnapshot(layout)), layout)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:terminal-focus-layout`

Expected: FAIL because `terminalFocusLayout.ts` does not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export interface TerminalFocusLayout { focusMode: boolean; hostListWidth: number; hostListCollapsed: boolean; aiPanelCollapsed: boolean; quickCommandsCollapsed: boolean; statusBarHidden: boolean; topBarHidden: boolean }
export interface TerminalFocusSnapshot { hostListWidth: number; hostListCollapsed: boolean; aiPanelCollapsed: boolean; quickCommandsCollapsed: boolean }
export const TERMINAL_FOCUS_STORAGE_KEY = 'terminal-focus-layout'
export const createTerminalFocusSnapshot = (layout: TerminalFocusLayout): TerminalFocusSnapshot => ({ hostListWidth: layout.hostListWidth, hostListCollapsed: layout.hostListCollapsed, aiPanelCollapsed: layout.aiPanelCollapsed, quickCommandsCollapsed: layout.quickCommandsCollapsed })
export const restoreTerminalFocusLayout = (snapshot: TerminalFocusSnapshot): TerminalFocusLayout => ({ focusMode: false, ...snapshot, statusBarHidden: false, topBarHidden: false })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:terminal-focus-layout`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/verify-terminal-focus-layout.mjs src/utils/terminalFocusLayout.ts
git commit -m "feat: add terminal focus layout state"
```

### Task 2: Workspace focus layout

**Files:**
- Modify: `src/views/WorkspaceView.vue`
- Modify: `src/components/QuickCommands.vue`
- Test: `scripts/verify-terminal-focus-layout.mjs`

**Interfaces:**
- Consumes `focusMode: Ref<boolean>` through Vue `provide/inject`.
- Produces a host-list collapse handle and a quick-command collapsed state synchronized with focus mode.

- [ ] **Step 1: Extend the failing test**

```js
assert.equal(focusLayout.focusMode, true)
assert.equal(focusLayout.hostListCollapsed, true)
assert.equal(focusLayout.quickCommandsCollapsed, true)
assert.equal(focusLayout.statusBarHidden, true)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:terminal-focus-layout`

Expected: FAIL because focus-mode transformation is missing.

- [ ] **Step 3: Implement workspace state and markup**

```ts
watch(focusMode, (enabled) => {
  if (enabled) { hostListCollapsed.value = true; quickCommandsCollapsed.value = true }
})
provide('quickCommandsCollapsed', quickCommandsCollapsed)
```

Add a 6px host-list restore handle when collapsed, bind host width to zero in focus mode, and bind `QuickCommands` to the injected collapsed ref. Hide the workspace status bar when focus mode is active.

- [ ] **Step 4: Run test and build**

Run: `npm run test:terminal-focus-layout && npm run build`

Expected: PASS and a successful Vite build.

- [ ] **Step 5: Commit**

```bash
git add src/views/WorkspaceView.vue src/components/QuickCommands.vue scripts/verify-terminal-focus-layout.mjs
git commit -m "feat: collapse workspace panels in focus mode"
```

### Task 3: Shell-level focus toggle and persistence

**Files:**
- Modify: `src/views/MainLayout.vue`
- Modify: `src/components/TerminalPanel.vue`
- Test: `scripts/verify-terminal-focus-layout.mjs`

**Interfaces:**
- Consumes the focus layout utility from Task 1.
- Provides `terminalFocusMode: Ref<boolean>` to `WorkspaceView`.
- Produces `toggleTerminalFocusMode(): void`.

- [ ] **Step 1: Extend the failing test**

```js
const restored = restoreTerminalFocusLayout({ hostListWidth: 220, hostListCollapsed: false, aiPanelCollapsed: false, quickCommandsCollapsed: false })
assert.equal(restored.hostListWidth, 220)
assert.equal(restored.aiPanelCollapsed, false)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:terminal-focus-layout`

Expected: FAIL until toggle persistence and restore behavior are wired.

- [ ] **Step 3: Implement the focus toggle**

```ts
function toggleTerminalFocusMode() {
  terminalFocusMode.value = !terminalFocusMode.value
  localStorage.setItem(TERMINAL_FOCUS_STORAGE_KEY, JSON.stringify({ enabled: terminalFocusMode.value, snapshot: focusSnapshot.value }))
}
provide('terminalFocusMode', terminalFocusMode)
```

Add a compact focus button to the top bar, hide the top bar during focus mode, force the AI panel into its existing collapsed state, and restore the prior state when exiting. Dispatch `window.dispatchEvent(new Event('aiterminal:layout-changed'))`; `TerminalPanel` listens for it and calls the existing xterm fit operation after `nextTick`.

- [ ] **Step 4: Run all verification**

Run: `npm run test:terminal-focus-layout`, `npm run test:ui-refresh`, `npm run build`, `cargo build`, then start `src-tauri/target/debug/aiterminal.exe` for 8 seconds and confirm it remains running.

Expected: all commands succeed and the app stays alive during startup validation.

- [ ] **Step 5: Commit**

```bash
git add src/views/MainLayout.vue src/components/TerminalPanel.vue scripts/verify-terminal-focus-layout.mjs
git commit -m "feat: add persistent terminal focus mode"
```
