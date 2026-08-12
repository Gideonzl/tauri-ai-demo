# 极简脚本工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将脚本管理默认页收敛为脚本编辑、保存和运行三个主操作，同时保留现有功能的按需入口。

**Architecture:** 在 `ScriptAutomationView.vue` 内调整展示层，不改变 `scriptAutomation` store、调度或执行预览数据流。低频操作经 Element Plus 下拉菜单访问；目标、标签和风险提示移动到可展开运行设置。

**Tech Stack:** Vue 3、TypeScript、Element Plus、SCSS、Vite、Tauri/Rust。

## Global Constraints

- 不新增依赖，不改变脚本持久化格式。
- 保留中英文切换，新增文案必须使用现有或新增 locale key。
- 不打包安装程序；每次修改完成执行 UI、构建、Rust 与启动检查。
- 不纳入工作区未跟踪的 `npm` 文件。

---

### Task 1: 收敛脚本库与编辑工具栏

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Test: `scripts/verify-ui-refresh.mjs`

- [ ] 将导入、导出收进脚本库溢出菜单，保留图标化新建动作。
- [ ] 将编辑器工具栏收敛为保存、运行和“更多”菜单。
- [ ] 将专注编辑、AI 编写、AI 审查、复制、版本和删除放入“更多”。
- [ ] 更新 UI 静态回归断言，确认默认页不再渲染旧的常驻工具栏。
- [ ] 运行 `npm run test:ui-refresh`。

### Task 2: 将运行附属信息改为按需设置

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Test: `scripts/verify-ui-refresh.mjs`

- [ ] 新增可展开的运行设置状态。
- [ ] 收起状态显示已选目标摘要；展开时显示目标选择、标签和风险等级。
- [ ] 从默认编辑页移除独立执行目标面板、风险大卡片和调度说明。
- [ ] 保持 `runNow`、参数预览和确认运行逻辑不变。
- [ ] 运行 `npm run test:ui-refresh`。

### Task 3: 视觉和响应式回归

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Test: `scripts/verify-ui-refresh.mjs`, `scripts/verify-terminal-focus-layout.mjs`

- [ ] 让编辑器填满可用高度，降低标题、描述和操作控件的视觉重量。
- [ ] 让窄宽度下新建与更多入口保持可用，运行设置改为单列。
- [ ] 执行 `npm run test:ui-refresh`、`npm run test:terminal-focus-layout`、`npm run build`、`cargo test` 和桌面程序启动检查。
- [ ] 用 `git diff --check` 检查空白错误。
