# Terminal Global Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, keyboard-first search overlay for the current xterm terminal buffer.

**Architecture:** `XTermFrontend` owns all interaction with `SearchAddon`, including decorations, result events, navigation, and cleanup. `TerminalPanel` owns the per-terminal overlay state and keyboard/focus lifecycle, rendering only the compact control above the terminal viewport.

**Tech Stack:** Vue 3 `<script setup>`, TypeScript, xterm.js 6, `@xterm/addon-search`, Sass, Node assertion scripts.

## Global Constraints

- Search only the mounted terminal panel's scrollback; do not add application-wide search or persistent storage.
- Use the installed `@xterm/addon-search`; do not add a dependency or copy terminal output into a custom matcher.
- Default matching is case-insensitive partial-text matching with theme-aware all-match and active-match decorations.
- `Ctrl+F`/`Cmd+F`, Enter/Down, Shift+Enter/Up, Esc, and close behavior must not send bytes to SSH.
- Keep the control compact, overlay-only, and theme-token based for light and dark schemes.
- Preserve the pre-existing untracked `npm` directory; never stage it.

---

### Task 1: Expose a safe search contract from XTermFrontend

**Files:**
- Modify: `src/frontends/XTermFrontend.ts:19-25, 58-65, 232-247, 324-361`
- Create: `scripts/verify-terminal-global-search.mjs`
- Modify: `package.json:5-21`

**Interfaces:**
- Consumes: `SearchAddon.findNext(term, options)`, `SearchAddon.findPrevious(term, options)`, `SearchAddon.clearDecorations()`, and `SearchAddon.onDidChangeResults`.
- Produces: `TerminalSearchResult = { resultIndex: number; resultCount: number }` and methods `updateSearch(query: string): boolean`, `findPrevious(query: string): boolean`, `clearSearch(): void`, and `onSearchResults(listener: (result: TerminalSearchResult) => void): { dispose(): void }`.
- Produces: `npm run test:terminal-global-search`, a source-level regression check for the terminal search contract and its required options.

- [ ] **Step 1: Write the failing terminal-search contract check**

Create `scripts/verify-terminal-global-search.mjs` using Node's strict assertions. It must read `src/frontends/XTermFrontend.ts` and `src/components/TerminalPanel.vue`, then assert the frontend exports `TerminalSearchResult`, subscribes to `onDidChangeResults`, uses `caseSensitive: false` and search `decorations`, clears decorations, and exposes the three search operations. It must also assert that the panel handles `Ctrl+F`, `Escape`, and the result count.

```js
assert.ok(frontend.includes('export interface TerminalSearchResult'))
assert.ok(frontend.includes('this.searchAddon.onDidChangeResults'))
assert.ok(frontend.includes('caseSensitive: false'))
assert.ok(frontend.includes('clearSearch(): void'))
assert.ok(panel.includes("event.key.toLowerCase() === 'f'"))
assert.ok(panel.includes("event.key === 'Escape'"))
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `node scripts/verify-terminal-global-search.mjs`

Expected: failure because `TerminalSearchResult`, a result event subscription, and overlay keyboard handling do not exist yet.

- [ ] **Step 3: Add the minimal xterm search adapter**

In `XTermFrontend.ts`, replace the invalid `showSearch()` path with a thin adapter around the installed addon. Define `TerminalSearchResult`, subscribe once to `onDidChangeResults`, and dispose the subscription with the frontend. Build decoration colors from the current CSS custom properties each time a search runs, with safe fallbacks. The option object must be equivalent to:

```ts
const SEARCH_OPTIONS = {
  caseSensitive: false,
  decorations: {
    matchBackground: read('--terminal-search-match-bg', '#5d5a1a'),
    matchBorder: read('--terminal-search-match-border', '#c9b83c'),
    matchOverviewRuler: read('--terminal-search-match-border', '#c9b83c'),
    activeMatchBackground: read('--terminal-search-active-bg', '#d8ad32'),
    activeMatchBorder: read('--terminal-search-active-border', '#fff3aa'),
    activeMatchColorOverviewRuler: read('--terminal-search-active-border', '#fff3aa'),
  },
}
```

`updateSearch` calls `findNext` with incremental matching, `findPrevious` calls the addon backward, `clearSearch` calls `clearDecorations` and resets emitted counts to `-1 / 0`, and every method guards an empty query safely.

- [ ] **Step 4: Register the npm script and run the check**

Add this package script:

```json
"test:terminal-global-search": "node scripts/verify-terminal-global-search.mjs"
```

Run: `npm run test:terminal-global-search`

Expected: `Terminal global search checks passed`.

- [ ] **Step 5: Commit the frontend contract**

```powershell
git add -- src/frontends/XTermFrontend.ts scripts/verify-terminal-global-search.mjs package.json
git commit -m "feat: add terminal search contract"
```

### Task 2: Render the compact terminal search overlay and wire keyboard focus

**Files:**
- Modify: `src/components/TerminalPanel.vue:10-15, 42-45, 286-336, 439-508`
- Modify: `scripts/verify-terminal-global-search.mjs`

**Interfaces:**
- Consumes: `frontend.updateSearch(query)`, `frontend.findPrevious(query)`, `frontend.clearSearch()`, and `frontend.onSearchResults(listener)` from Task 1.
- Produces: per-panel reactive `terminalSearch` state, a focusable `terminal-search-overlay`, and keyboard/focus handlers that do not write through `frontend.input$`.

- [ ] **Step 1: Extend the failing check with overlay-specific expectations**

Add assertions that `TerminalPanel.vue` contains a `terminal-search-overlay`, query `ref`, next and previous functions, a `searchInput` ref, and a focus return via `frontend?.focus()`.

```js
assert.ok(panel.includes('class="terminal-search-overlay"'))
assert.ok(panel.includes('const searchQuery = ref'))
assert.ok(panel.includes('function openTerminalSearch'))
assert.ok(panel.includes('function closeTerminalSearch'))
assert.ok(panel.includes('frontend?.focus()'))
```

- [ ] **Step 2: Run the check and verify it fails**

Run: `npm run test:terminal-global-search`

Expected: failure because the compact overlay and its per-panel state have not been implemented.

- [ ] **Step 3: Implement the overlay and its key handling**

Add a conditional overlay inside `.tp`, positioned relative to the terminal content. Its template must include one `el-input`, a compact `current / total` counter, icon-only previous/next buttons with accessible labels, and an icon-only close button.

In the panel script:

```ts
const terminalSearchOpen = ref(false)
const searchQuery = ref('')
const searchResult = ref<TerminalSearchResult>({ resultIndex: -1, resultCount: 0 })
const searchInput = ref<HTMLInputElement>()

function openTerminalSearch() {
  terminalSearchOpen.value = true
  nextTick(() => searchInput.value?.focus())
}

function closeTerminalSearch() {
  terminalSearchOpen.value = false
  searchQuery.value = ''
  frontend?.clearSearch()
  nextTick(() => frontend?.focus())
}
```

Register a document `keydown` handler on mount and remove it on unmount. It intercepts only `Ctrl+F`/`Cmd+F` while this terminal panel is active, and never forwards those keys to `frontend.input$`. The overlay handles Enter/Down for next, Shift+Enter/Up for previous, and Esc for close. Watch `searchQuery` to call `frontend?.updateSearch`; register and dispose `onSearchResults` when frontend is created/destroyed.

Style the overlay as a small, `position: absolute` panel at the terminal viewport's upper-right. Use `$surface-contrast`, `$color-border`, `$color-text-primary`, and existing primary tokens; avoid permanent headers, shadows, and broad background overlays. Add a compact responsive rule so it cannot overflow a narrow terminal.

- [ ] **Step 4: Run automated verification and production build**

Run:

```powershell
npm run test:terminal-global-search
npm run test:ssh-terminal-reliability
npm run test:terminal-colorizer
npm run test:ui-refresh
npm run build
```

Expected: every assertion script passes and Vite completes successfully. Existing non-fatal chunk-size or dynamic-import warnings may remain, but no new TypeScript or Vue errors are acceptable.

- [ ] **Step 5: Perform a fresh startup smoke test**

Start a dedicated Vite server on an unused port, open a fresh browser tab, and confirm startup console warnings/errors are empty. Open a terminal, invoke `Ctrl+F`, search sample output, verify highlights and counter navigation, press Esc, and confirm terminal typing works again.

- [ ] **Step 6: Commit and push the complete feature**

```powershell
git add -- src/components/TerminalPanel.vue src/frontends/XTermFrontend.ts scripts/verify-terminal-global-search.mjs package.json
git commit -m "feat: add terminal global search"
git push origin main
```
