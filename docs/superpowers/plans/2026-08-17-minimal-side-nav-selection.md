# Minimal Side Navigation Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected left navigation item symmetric and compact at every sidebar width.

**Architecture:** Keep the existing `SideNav.vue` template and routes unchanged. The row remains the pointer target, while active styling moves to the fixed-size icon shell and uses a short, vertically centered indicator.

**Tech Stack:** Vue 3 `<script setup>`, scoped SCSS, Element Plus icons, Vite.

## Global Constraints

- Preserve icon-only and expanded navigation behaviour.
- Do not change routes, labels, persistence, or add dependencies.
- Active icon surface is 36 × 36 px; active indicator is 2 × 22 px.
- Verify UI refresh checks, production build, and compact-width browser smoke test.

---

### Task 1: Make active navigation styling compact and symmetric

**Files:**
- Modify: `src/components/SideNav.vue:91-139`
- Test: `npm run test:ui-refresh`

**Interfaces:**
- Consumes: `.nav-item.active` and `.nav-icon-shell` classes emitted by the existing template.
- Produces: a route-selected visual state with a fixed `36px` icon surface and a centered `2px × 22px` indicator.

- [ ] **Step 1: Write the failing structural assertion**

Add these checks to the existing UI verification script so the selected state cannot return to a full-row background:

```js
assert.ok(sideNav.includes('.nav-item.active .nav-icon-shell'), 'active nav styling must target the icon shell')
assert.ok(sideNav.includes('width: 36px') && sideNav.includes('height: 36px'), 'active icon surface must stay fixed at 36px')
assert.ok(sideNav.includes('height: 22px'), 'active indicator must stay vertically centered at 22px')
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run: `npm run test:ui-refresh`

Expected: FAIL because `SideNav.vue` currently has no dedicated 36 px active icon surface.

- [ ] **Step 3: Write the minimal SCSS implementation**

In `SideNav.vue`, replace the full active row background with transparent row styling. Add an `.nav-item.active .nav-icon-shell` rule with a fixed 36 px square background and retain primary icon colour. Change `.nav-item.active::before` to `top: 50%`, `height: 22px`, and `transform: translateY(-50%)` so the indicator remains centered.

```scss
.nav-item.active { background: transparent; }
.nav-item.active .nav-icon-shell {
  width: 36px;
  height: 36px;
  background: $color-bg-active;
}
.nav-item.active::before {
  top: 50%;
  height: 22px;
  transform: translateY(-50%);
}
```

- [ ] **Step 4: Run tests to verify the implementation**

Run: `npm run test:ui-refresh`

Expected: PASS.

- [ ] **Step 5: Run build and compact-width smoke check**

Run: `npm run build`

Expected: exit code 0. Start Vite, resize the main window viewport below 80 px sidebar width, and confirm the active icon background is a centered square with a centered short indicator.

- [ ] **Step 6: Commit**

```bash
git add src/components/SideNav.vue scripts/verify-ui-refresh.mjs
git commit -m "fix: balance compact nav selection"
```
