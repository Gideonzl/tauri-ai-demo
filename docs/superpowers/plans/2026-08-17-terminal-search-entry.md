# Terminal Search Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make terminal search discoverable through a compact title-bar button that opens the existing search control.

**Architecture:** `TerminalPanel.vue` remains the only UI owner for search state. The new button delegates directly to the existing `openTerminalSearch()` function, so mouse and keyboard entry paths share the same focus, highlight, result-count, and cleanup lifecycle.

**Tech Stack:** Vue 3 `<script setup>`, Element Plus icons, Sass, existing Node regression scripts, Vite.

## Global Constraints

- Use the existing terminal search state and `openTerminalSearch()` function; do not create another search state or xterm adapter.
- The title bar shows a magnifier and `Ctrl F`; at narrow terminal widths only the magnifier remains visible with a localized tooltip.
- The button uses existing theme tokens and gets a restrained active treatment while the overlay is open.
- Do not add dependencies, persist UI state, or stage the pre-existing untracked `npm` directory.

---

### Task 1: Add the discoverable terminal search entry

**Files:**
- Modify: `src/components/TerminalPanel.vue:14-20, 459-508`
- Modify: `scripts/test-terminal-search.mjs`

**Interfaces:**
- Consumes: `openTerminalSearch(): void` and `terminalSearchOpen: Ref<boolean>` already owned by `TerminalPanel.vue`.
- Produces: a localized `terminal-search-trigger` button that invokes the existing search flow and adjusts at narrow widths.

- [ ] **Step 1: Write the failing entry regression check**

Extend `scripts/test-terminal-search.mjs` to read `src/components/TerminalPanel.vue` and assert the presence of the trigger, the click handler, its localized title, compact keyboard hint, open-state class binding, and narrow-width CSS rule.

```js
const panel = readFileSync(resolve(root, 'src/components/TerminalPanel.vue'), 'utf8')
assert.ok(panel.includes('class="terminal-search-trigger"'))
assert.ok(panel.includes('@click="openTerminalSearch"'))
assert.ok(panel.includes("t('terminal.searchPlaceholder')"))
assert.ok(panel.includes("'is-active': terminalSearchOpen"))
assert.ok(panel.includes('@media (max-width: 520px)'))
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:terminal-global-search`

Expected: failure because the discoverable title-bar trigger and narrow-width treatment do not yet exist.

- [ ] **Step 3: Implement the minimal shared-state trigger**

Add this button after the title-bar connection status and before the final status spacer:

```vue
<button
  type="button"
  class="terminal-search-trigger"
  :class="{ 'is-active': terminalSearchOpen }"
  :title="t('terminal.searchPlaceholder')"
  :aria-label="t('terminal.searchPlaceholder')"
  @click="openTerminalSearch"
>
  <el-icon><Search /></el-icon>
  <kbd>Ctrl F</kbd>
</button>
```

Import the `Search` icon. Style the button with existing surface, border, text, hover, focus, and primary tokens. Use a single `@media (max-width: 520px)` rule to hide only `kbd`; the icon remains available. The `is-active` class must provide a small border/color change without shadows or layout shift.

- [ ] **Step 4: Run focused checks and build**

Run:

```powershell
npm run test:terminal-global-search
npm run test:ssh-terminal-reliability
npm run test:ui-refresh
npm run build
```

Expected: all tests pass and Vite completes without new TypeScript or Vue errors.

- [ ] **Step 5: Perform fresh UI/startup smoke test**

Open a fresh local application page, create the browser-only demo terminal, click the new title-bar search button, verify the existing search input receives focus, then press Escape and verify the terminal input regains focus. Confirm fresh startup console warnings/errors are empty.

- [ ] **Step 6: Commit and push**

```powershell
git add -- src/components/TerminalPanel.vue scripts/test-terminal-search.mjs docs/superpowers/plans/2026-08-17-terminal-search-entry.md
git commit -m "feat: add terminal search button"
git push origin main
```
