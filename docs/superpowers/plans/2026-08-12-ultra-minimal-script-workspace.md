# 超极简脚本工作区 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将脚本编辑页改为自动保存的终端优先界面，仅保留运行与三点更多入口。

**Architecture:** 仅调整 `ScriptAutomationView.vue` 的展示和草稿保存协调。现有 Pinia `upsertScript`、执行预览、计划任务、版本记录接口保持不变；视图通过 700ms 防抖将已修改草稿写入 store，并在运行前同步保存。

**Tech Stack:** Vue 3、TypeScript、Pinia、Element Plus、SCSS、Vite、Tauri/Rust。

## Global Constraints

- 不新增依赖，不修改脚本持久化格式和执行权限逻辑。
- 自动保存第一次创建脚本前必须要求非空脚本内容。
- 自动保存防抖为 700ms，避免每个输入事件都产生版本历史。
- 新文案必须同时写入 `src/i18n/zh-CN.json` 与 `src/i18n/en.json`。
- 不打包安装程序；保留未跟踪的 `npm` 文件。

---

### Task 1: 建立自动保存回归与草稿同步

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Modify: `scripts/verify-ui-refresh.mjs`

- [ ] 添加失败的静态回归断言，要求存在防抖自动保存、运行前同步保存与首次内容校验。
- [ ] 运行 `npm run test:ui-refresh`，确认因缺少自动保存结构而失败。
- [ ] 增加草稿快照比较、700ms 定时保存和卸载清理。
- [ ] 让 `runNow` 在展示预览前调用同步保存；空脚本仍走现有必填提示。
- [ ] 运行 `npm run test:ui-refresh`，确认通过。

### Task 2: 移除默认编辑页的冗余控件

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Modify: `src/i18n/zh-CN.json`
- Modify: `src/i18n/en.json`
- Modify: `scripts/verify-ui-refresh.mjs`

- [ ] 删除保存按钮和常驻调度器状态。
- [ ] 将“更多”触发器改成无文字、无下拉箭头的三点图标按钮。
- [ ] 将名称与描述改为轻量文本输入；默认不显示厚重外框。
- [ ] 运行设置收起时显示“目标 · 未选择/已选 N 台”。
- [ ] 运行 `npm run test:ui-refresh`。

### Task 3: 完整验证与交付

**Files:**
- Modify: `src/views/ScriptAutomationView.vue`
- Test: `scripts/verify-ui-refresh.mjs`, `scripts/verify-terminal-focus-layout.mjs`, `scripts/verify-agent-execution.mjs`, `scripts/verify-ssh-terminal-reliability.mjs`

- [ ] 执行 UI、终端、智能体、SSH 回归和 `npm run build`。
- [ ] 在 `src-tauri` 执行 `cargo test` 与 `cargo build`。
- [ ] 启动 `src-tauri/target/debug/aiterminal.exe` 至少 8 秒并确认未退出。
- [ ] 执行 `git diff --check`，提交并推送到 `main`。
