# Tauri远程SSH/RDP+AI工具 — SSH连接核心功能模块UI规范

> **文档性质：** SSH模块唯一设计与验收标准  
> **制定人：** 产品设计UI验收总师  
> **制定时间：** 2026-06-02  
> **迭代模式：** 基于现有Termius风格框架迭代，不重构底层  
> **开发周期：** 2小时

---

## 一、SSH模块整体布局

### 1.1 中间工作区布局结构

中间工作区在SSH功能落地后，从空状态变为完整功能区域：

```
┌──────────────────────────────────────────────┐
│ 工作区头部 40px                                │
│ [Hosts] [终端标签1] [终端标签2] [+]    [设置] │
├──────────────────────────────────────────────┤
│                                              │
│  ┌────────────┬──────────────────────────┐   │
│  │ 服务器列表   │  终端面板 (Xterm.js)      │   │
│  │  200px      │  flex:1                  │   │
│  │             │                          │   │
│  │ [服务器1] ● │  root@server1:~$         │   │
│  │ [服务器2] ○ │  $ ls -la               │   │
│  │ [服务器3] ○ │  drwxr-xr-x  5 root ... │   │
│  │             │                          │   │
│  │ ─────────── │                          │   │
│  │ [+ 新建]    │                          │   │
│  └────────────┴──────────────────────────┘   │
│                                              │
├──────────────────────────────────────────────┤
│ 底部状态栏 24px                                │
│ [●已连接] [root@192.168.1.1] | [AI Ready] | [v0.3.0] │
└──────────────────────────────────────────────┘
```

### 1.2 布局尺寸

| 区域 | 宽度 | 高度 | 说明 |
|------|------|------|------|
| 工作区头部 | 100% | 40px | 标签栏+操作按钮 |
| 服务器列表 | 200px | flex:1 | 可折叠，最小120px |
| 终端面板 | flex:1 | flex:1 | Xterm.js渲染区 |
| 底部状态栏 | 100% | 24px | 连接状态+主机信息 |

### 1.3 两种视图模式

| 模式 | 触发条件 | 布局 |
|------|---------|------|
| 空状态 | 无服务器配置 | 居中空状态提示 + "新建连接"按钮 |
| 列表模式 | 有服务器配置 | 左侧服务器列表 + 右侧终端面板 |
| 终端模式 | 有活跃连接 | 标签栏显示终端标签 + Xterm面板 |

---

## 二、服务器列表规范

### 2.1 列表项结构

```
┌────────────────────┐
│ ●  server-name     │  ← 连接状态点 + 服务器名称
│    192.168.1.1:22   │  ← 主机:端口（等宽字体，灰色）
└────────────────────┘
```

### 2.2 列表项样式

| 属性 | 值 | 说明 |
|------|-----|------|
| 高度 | 48px | 固定高度 |
| 内间距 | 8px 12px | 上下8px，左右12px |
| 服务器名 | 13px, $color-text-primary | 主文字 |
| 主机地址 | 11px, $font-family-mono, $color-text-secondary | 等宽灰色 |
| 连接状态点 | 6px圆形 | 绿色=已连接，灰色=未连接，红色=异常 |
| 选中态 | 左侧2px $color-primary竖条 + $color-bg-active背景 | |
| 悬停态 | $color-bg-hover背景 | |
| 右键菜单 | 编辑/删除/复制地址 | Element Plus右键菜单 |

### 2.3 列表底部操作

- **[+ 新建连接]** 按钮：列表底部，$color-primary文字按钮
- **列表为空时：** 居中空状态图标 + "暂无服务器" + "新建连接"按钮

---

## 三、新建SSH连接表单

### 3.1 表单结构（Dialog弹窗）

参考FinalShell新建连接弹窗 + Termius极简风格：

```
┌─────────────────────────────────────┐
│  New SSH Connection          [×]   │
├─────────────────────────────────────┤
│                                     │
│  Name     [                    ]    │
│  Host     [                    ]    │
│  Port     [  22               ]    │
│  Username [  root             ]    │
│                                     │
│  Authentication                     │
│  ○ Password  [********************] │
│  ○ Key File  [选择文件...     ]    │
│                                     │
│           [Cancel]  [Connect]       │
│                                     │
└─────────────────────────────────────┘
```

### 3.2 字段规范

| 字段 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| Name | el-input | 是 | - | 服务器显示名称 |
| Host | el-input | 是 | - | IP地址或域名，等宽字体 |
| Port | el-input-number | 是 | 22 | 端口号，1-65535 |
| Username | el-input | 是 | root | 登录用户名 |
| Auth Type | el-radio-group | 是 | password | 密码/私钥二选一 |
| Password | el-input(password) | 条件 | - | 密码认证时必填 |
| Key File | el-input + 浏览按钮 | 条件 | - | 私钥认证时必填 |

### 3.3 表单样式

- **弹窗宽度：** 420px
- **弹窗背景：** $color-bg-elevated (#2a2a45)
- **表单标签：** 左对齐，80px宽，$font-size-sm
- **输入框：** $color-bg-input背景，$border-radius-sm圆角
- **Host字段：** 等宽字体 $font-family-mono
- **Port字段：** 宽度80px
- **认证切换：** el-radio-group，紧凑排列
- **Connect按钮：** $color-primary主色，点击后→连接中状态（loading）
- **Cancel按钮：** 默认灰色按钮

### 3.4 交互流程

```
点击"新建连接" → 弹窗打开 → 填写表单 → 点击Connect
  → 按钮变为loading "Connecting..." 
  → 调用Rust ssh_connect指令
  → 成功：弹窗关闭，新建终端标签，Xterm面板显示
  → 失败：弹窗内显示错误信息（红色文字），按钮恢复
```

---

## 四、终端标签栏规范

### 4.1 标签栏结构

```
[Hosts] [● server1] [○ server2] [+]        [⚙]
 列表    活跃标签    非活跃标签   新建终端    设置
```

### 4.2 标签样式

| 元素 | 样式 |
|------|------|
| 标签高度 | 32px |
| 标签内间距 | 0 12px |
| 活跃标签 | 底部2px $color-primary横线 + $color-bg-surface背景 |
| 非活跃标签 | $color-bg-primary背景 + $color-text-secondary文字 |
| 标签文字 | $font-size-sm (12px)，服务器名称 |
| 连接状态点 | 标签文字前6px圆点，绿色=已连接 |
| 关闭按钮 | 标签右侧×图标，hover显示，8x8px |
| [+]按钮 | 新建终端标签，$color-text-secondary |
| [Hosts]标签 | 切换到服务器列表视图，特殊样式 |

### 4.3 标签交互

- **点击标签：** 切换到对应终端
- **点击×：** 关闭标签 → 断开SSH连接 → 确认弹窗（如有未保存内容）
- **右键标签：** 关闭/关闭其他/重连
- **标签过多：** 横向滚动，左右箭头导航

---

## 五、终端面板规范（Xterm.js）

### 5.1 终端配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 字体 | JetBrains Mono / Menlo / Consolas | 等宽字体栈 |
| 字号 | 14px | 可通过设置调整 |
| 行高 | 1.2 | 紧凑排列 |
| 光标 | block（方块） | 闪烁 |
| 光标色 | $color-primary (#5b8def) | 冷蓝色 |
| 前景色 | #e8e8f0 | 高对比度文字 |
| 背景色 | #1b1b2f | 与主背景一致 |
| 主题 | Termius深色 | 自定义xterm主题 |

### 5.2 Xterm主题色

```typescript
const termiusTheme: ITheme = {
  background: '#1b1b2f',
  foreground: '#e8e8f0',
  cursor: '#5b8def',
  cursorAccent: '#1b1b2f',
  selectionBackground: 'rgba(91, 141, 239, 0.3)',
  black: '#333350',
  red: '#d45454',
  green: '#4caf7d',
  yellow: '#d4a24e',
  blue: '#5b8def',
  magenta: '#b07dd8',
  cyan: '#5bc0de',
  white: '#e8e8f0',
  brightBlack: '#555570',
  brightRed: '#e07070',
  brightGreen: '#6dcf9a',
  brightYellow: '#e0b86e',
  brightBlue: '#7ba4f2',
  brightMagenta: '#c99de6',
  brightCyan: '#7dd3ee',
  brightWhite: '#ffffff',
}
```

### 5.3 终端交互

| 操作 | 实现 |
|------|------|
| 键盘输入 | Xterm.onData → Rust ssh_write |
| 终端回显 | Rust Tauri Event → Xterm.write |
| 窗口resize | Xterm.onResize → Rust ssh_resize |
| 复制 | 选中文字自动复制到剪贴板 |
| 粘贴 | 右键/Ctrl+Shift+V粘贴 |
| 清屏 | Ctrl+L 或终端右键菜单 |
| 全选 | Ctrl+Shift+A |

### 5.4 终端右键菜单

```
┌──────────────┐
│ Copy         │
│ Paste        │
│ Clear        │
│ Select All   │
│ ──────────── │
│ Reconnect    │
│ Disconnect   │
└──────────────┘
```

---

## 六、连接状态交互规范

### 6.1 状态定义

| 状态 | 颜色 | 图标 | 说明 |
|------|------|------|------|
| 未连接 | $color-text-secondary (灰) | ○ 空心圆 | 初始状态 |
| 连接中 | $color-warning (黄) | ◐ 半圆 | 正在建立连接 |
| 已连接 | $color-success (绿) | ● 实心圆 | 连接成功，可交互 |
| 已断开 | $color-text-secondary (灰) | ○ 空心圆 | 用户主动断开 |
| 连接失败 | $color-danger (红) | ✕ 叉号 | 连接失败 |
| 重连中 | $color-warning (黄) | ↻ 旋转 | 自动重连中 |

### 6.2 状态流转

```
未连接 → [点击连接] → 连接中 → [成功] → 已连接
                              → [失败] → 连接失败 → [重试] → 连接中
已连接 → [用户断开] → 已断开
已连接 → [网络断开] → 连接失败 → [自动重连] → 重连中 → [成功] → 已连接
```

### 6.3 状态提示

- **连接中：** 终端面板显示 "Connecting to root@192.168.1.1..." + 旋转loading
- **连接成功：** 终端正常显示shell提示符
- **连接失败：** 终端面板显示红色错误信息 + [Retry] 按钮
- **断开重连：** 终端面板显示黄色 "Connection lost. Reconnecting..." + 倒计时

---

## 七、服务器配置数据结构

### 7.1 前端类型

```typescript
interface SshHost {
  id: string              // UUID
  name: string            // 显示名称
  host: string            // IP/域名
  port: number            // 端口，默认22
  username: string        // 用户名
  authType: 'password' | 'key'  // 认证方式
  password?: string       // 密码（加密存储）
  keyPath?: string        // 私钥路径
  groupId?: string        // 分组ID（预留）
  lastConnected?: number  // 最后连接时间
  createdAt: number       // 创建时间
}
```

### 7.2 Rust端结构

```rust
pub struct SshHostConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_type: SshAuthType,
    pub password_encrypted: Option<String>,
    pub key_path: Option<String>,
    pub group_id: Option<String>,
    pub last_connected: Option<u64>,
    pub created_at: u64,
}

pub enum SshAuthType {
    Password,
    PublicKey,
}
```

---

## 八、Rust后端SSH指令规范

### 8.1 Tauri指令

| 指令 | 参数 | 返回 | 说明 |
|------|------|------|------|
| `ssh_connect` | `{id, host, port, username, authType, password?, keyPath?}` | `Result<String>` | 建立SSH连接，返回sessionId |
| `ssh_disconnect` | `{sessionId}` | `Result<()>` | 断开连接 |
| `ssh_write` | `{sessionId, data}` | `Result<()>` | 向终端写入数据 |
| `ssh_resize` | `{sessionId, cols, rows}` | `Result<()>` | 终端尺寸变化 |

### 8.2 Tauri Event（Rust→前端推送）

| Event名 | Payload | 说明 |
|---------|---------|------|
| `ssh-data` | `{sessionId, data: string}` | 终端回显数据 |
| `ssh-closed` | `{sessionId, reason: string}` | 连接关闭 |
| `ssh-error` | `{sessionId, error: string}` | 连接错误 |

### 8.3 SSH连接管理

- **多连接隔离：** 每个SSH连接独立sessionId，互不干扰
- **连接池：** Rust端HashMap<sessionId, SshSession>管理所有活跃连接
- **心跳检测：** 每30秒发送keepalive包，超时60秒自动断开
- **自动重连：** 非用户主动断开时，自动重试3次，间隔5/10/15秒

---

## 九、前端新增文件清单

| 文件 | 说明 |
|------|------|
| `src/stores/ssh.ts` | SSH连接状态管理（主机列表、连接状态、会话管理） |
| `src/components/HostList.vue` | 服务器列表组件 |
| `src/components/HostForm.vue` | 新建/编辑SSH连接表单弹窗 |
| `src/components/TerminalTab.vue` | 终端标签栏 |
| `src/components/TerminalPanel.vue` | Xterm.js终端面板 |
| `src/views/WorkspaceView.vue` | 重写：集成HostList+TerminalTab+TerminalPanel |

### 9.1 需修改的现有文件

| 文件 | 修改内容 |
|------|---------|
| `src/views/WorkspaceView.vue` | 从空状态→完整SSH工作区 |
| `src/components/SideNav.vue` | 添加终端/SFTP菜单项图标 |
| `src/stores/config.ts` | 添加SSH主机配置持久化方法 |
| `src/api/tauri.ts` | 添加ssh_connect/disconnect/write/resize封装 |
| `src/types/tauri.ts` | 添加SshHost/SshSession类型定义 |
| `package.json` | 添加xterm.js依赖 |

---

## 十、Rust后端新增/修改文件清单

| 文件 | 说明 |
|------|------|
| `src-tauri/src/protocol/ssh/mod.rs` | 重写：集成russh库，实现SSH客户端 |
| `src-tauri/src/commands/ssh.rs` | 新增：ssh_connect/disconnect/write/resize指令 |
| `src-tauri/src/storage/ssh.rs` | 新增：SSH主机配置加密存储 |
| `src-tauri/Cargo.toml` | 添加russh/tokio依赖 |

---

## 十一、验收标准

### 11.1 UI验收

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | Termius风格统一 | 色值/间距/圆角/字体对齐TERMIUS_UI_SPEC.md |
| 2 | 无emoji | 搜索源码零emoji |
| 3 | 三栏布局稳定 | 左56+中flex+右320，缩放不错乱 |
| 4 | 服务器列表样式 | 列表项48px，状态点/选中态/悬停态正确 |
| 5 | 新建连接弹窗 | 420px宽，表单完整，Termius深色风格 |
| 6 | 终端标签栏 | 标签32px，活跃/非活跃/关闭按钮正确 |
| 7 | Xterm终端 | Termius深色主题，等宽字体，光标冷蓝 |

### 11.2 功能验收

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | 新建SSH连接 | 填写表单→连接→终端显示shell提示符 |
| 2 | 终端交互 | 输入命令→回显结果，实时双向 |
| 3 | 多标签终端 | 同时连接2+服务器，标签切换正常 |
| 4 | 断开连接 | 点击断开→终端显示断开→状态更新 |
| 5 | 连接失败 | 错误主机→显示错误信息+重试按钮 |
| 6 | 服务器列表CRUD | 新建/编辑/删除服务器配置 |
| 7 | 配置持久化 | 重启软件服务器列表不丢失 |
| 8 | 终端resize | 窗口缩放→终端自适应 |
| 9 | 复制粘贴 | 选中复制/右键粘贴正常 |

### 11.3 AI模块不受影响

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | AI面板正常 | 右侧AI面板流式对话正常 |
| 2 | AI配置页正常 | /ai-config页面CRUD正常 |
| 3 | 智能体切换 | 4套智能体切换正常 |
| 4 | AI与SSH解耦 | SSH操作不影响AI对话 |

---

**本文档为SSH连接模块唯一标准来源，所有实现必须严格遵循。**
