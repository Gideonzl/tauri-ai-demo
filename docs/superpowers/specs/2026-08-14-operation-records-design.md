# 独立命令执行记录设计

## 目标

把每次命令执行保存成独立、可追踪、可再次使用的操作记录。用户能够查看命令和对应输出，并对单条记录执行“发送 AI、再次执行、保存为命令方案、复制”。

第一阶段覆盖交互终端命令，同时建立可供 AI、脚本和批量运维后续接入的统一数据结构。界面继续遵循极简原则，不增加常驻侧栏或新的一级菜单。

## 非目标

- 不修改远端 Shell 配置、`PROMPT_COMMAND`、profile 文件或用户环境。
- 不承诺从普通 PTY 精确取得每条命令的退出码；无法确定时明确记录为未知。
- 不把终端重构成 Warp 式块状编辑器。
- 不新增云端同步、团队审计或审批流程。
- 本阶段不打包安装程序。

## 用户体验

### 终端

用户按回车后开始一条记录。系统采集随后到达的 PTY 输出：

- 检测到新的 Shell 提示符时，记录结束。
- 用户按 `Ctrl+C` 时，持续运行命令以“已中断”结束。
- 用户在上一条命令尚未识别为结束时提交下一条命令，上一条以“状态未知”结束，新命令正常开始记录。
- 单条输出超过 32 KB 时只保留末尾 32 KB，并标记已截断。

完成后，终端右侧出现一个非常轻量的 AI 图标装饰，定位在该条命令结束位置。点击后直接把该条命令及输出发到右侧 AI 助手。装饰不得改变终端文本布局，不得遮挡输入，也不得持续显示大卡片。

### 命令历史

现有命令历史页升级为操作记录列表，但保留旧历史兼容：

- 默认行只显示主机、命令、时间、状态和耗时。
- 点击行展开输出；没有输出时显示“命令完成，无输出”，旧记录显示“此历史记录未保存输出”。
- 单条记录提供：发送 AI、再次执行、保存为命令方案、复制、删除。
- 清空、按服务器筛选和搜索继续可用。

### AI 联动

发送内容使用稳定结构：服务器、命令、目录、状态、耗时和输出。AI 消息创建后自动打开右侧 AI 助手，但不自动执行第二条命令；是否执行仍由现有权限策略决定。

## 数据模型

新增统一结构：

```ts
export type OperationSource = 'terminal' | 'ai' | 'script' | 'batch'
export type OperationStatus = 'running' | 'success' | 'failed' | 'interrupted' | 'unknown'

export interface OperationRecord {
  id: string
  source: OperationSource
  serverId: string
  serverName: string
  sessionId?: string
  command: string
  cwd?: string
  output: string
  stderr?: string
  exitCode: number | null
  timedOut: boolean
  truncated: boolean
  status: OperationStatus
  startedAt: number
  finishedAt?: number
  durationMs?: number
}
```

交互 PTY 默认 `exitCode: null`。当记录因提示符结束时状态为 `success`，但 UI 文案表达为“已完成”，不宣称退出码为 0。AI、脚本和批量入口后续使用 `sshExecFull` 的真实退出码决定 `success` 或 `failed`。

## 模块设计

### `src/utils/terminal-command-capture.ts`

纯 TypeScript 状态机，不依赖 Vue、Pinia 或 xterm：

- `submit(command, context)` 开始记录；若已有活动记录，先以 `unknown` 完成。
- `append(data)` 清洗 ANSI、追加输出、检测提示符并在必要时完成。
- `interrupt()` 以 `interrupted` 完成。
- `flush()` 在会话销毁时以 `unknown` 完成。
- 通过 `onComplete(record)` 回调交付结果。

提示符检测采用保守规则：只检查最新非空行，并要求以 `$`、`#`、`>` 或 `%` 加可选空格结尾；匹配前必须已经收到命令回显之外的输出或短暂空闲。误判风险通过“下一条命令使上一条状态未知”的兜底机制控制。

### `src/stores/operationRecords.ts`

负责持久化、旧数据迁移、查询与容量限制：

- 本地键为 `operation-records-v1`。
- 首次加载时把旧 `cmd-history` 转成 `output: ''`、`status: 'unknown'` 的记录，迁移后保留旧键一个版本，不立即删除。
- 最多保存 200 条，每条输出最多 32 KB。
- 写入前对私钥块、Authorization、Token、Password 和 URL 用户信息进行脱敏。
- 暴露 `addRecord`、`updateRecord`、`deleteRecord`、`clearServer`、`clearAll`、`getRecord` 和筛选计算属性。

### `src/frontends/XTermFrontend.ts`

增加一个最小接口，用 xterm marker/decoration 在完成行渲染 AI 图标：

```ts
addOperationAction(recordId: string, onSendToAi: () => void): void
```

若当前运行环境不支持 decoration，功能静默降级；操作记录仍可在历史页使用。

### `src/components/TerminalPanel.vue`

只负责接线：输入流通知捕获器，输出流同时写入终端并通知捕获器，完成回调写入 store 并创建装饰。命令解析、脱敏和持久化不放进组件。

### `src/views/CommandHistoryView.vue`

改用操作记录 store，按需展开输出和显示极简操作。旧的保存命令方案与再次执行能力继续复用。

## 数据流

```text
keyboard input
  -> TerminalPanel
  -> TerminalCommandCapture.submit / interrupt
  -> SSHShellSession.sendInput

PTY output
  -> SSHShellSession.output$
  -> TerminalPanel
  -> XTermFrontend.write
  -> TerminalCommandCapture.append
  -> OperationRecordsStore.addRecord
  -> terminal decoration / history / AI / command recipe
```

## 错误与隐私处理

- 会话断开、组件卸载或 PTY 重建时，活动记录以 `unknown` 完成，不丢弃已采集输出。
- 只有本地持久化；不自动上传任何输出。
- 发送 AI 必须由用户点击触发。
- 脱敏在写入 store 前执行，导出时继续走现有二次脱敏。
- 输出存储失败不影响终端输入与显示，只记录控制台警告。
- 二进制或无效字符被替换，不允许破坏 JSON 持久化。

## 测试策略

1. 状态机单元测试：普通命令、无输出、持续命令 `Ctrl+C`、下一条命令覆盖、断线 flush、ANSI 清洗、32 KB 截断。
2. Store 单元测试：旧历史迁移、200 条限制、敏感信息脱敏、按服务器清理。
3. 源码接线验证：TerminalPanel 输入输出均接入捕获器，历史页提供五个单条操作，设置页包含新存储键。
4. 全量验证：现有 11 个验证脚本、`npm run build`。
5. 启动检查：启动 Vite，确认无编译错误；打开终端和命令历史页检查控制台无启动异常。

## 验收条件

- 在真实 SSH 终端执行 `pwd` 后，历史中出现一条包含命令及输出的独立记录。
- 执行无输出命令时，记录明确显示已完成且无输出。
- `tail -f` 后按 `Ctrl+C`，记录状态为已中断并保留已产生输出。
- 点击单条记录的“发送 AI”，右侧助手收到该记录的完整上下文。
- 旧的命令历史仍可查看和再次执行。
- 清除“AI 与历史”数据时同时删除操作记录。
- 不出现常驻新面板，不遮挡终端输入区域。

