# AI智能体桌面工具 Demo

> Tauri2 + Vue3 + TypeScript 极速Demo框架，2小时可运行基础骨架

## 🏗️ 项目结构

```
tauri-ai-demo/
├── index.html                    # 前端入口HTML
├── package.json                  # 前端依赖配置
├── vite.config.ts                # Vite构建配置（路径别名、SCSS、Tauri端口）
├── tsconfig.json                 # TypeScript配置
├── .env                          # 环境变量（AI API地址、模型）
├── .gitignore
├── public/
│   └── vite.svg                  # 网站图标
├── src/                          # Vue3前端源码
│   ├── main.ts                   # 应用入口（Vue3+Pinia+ElementPlus初始化）
│   ├── App.vue                   # 根组件
│   ├── env.d.ts                  # 环境类型声明
│   ├── router/
│   │   └── index.ts              # Vue Router配置
│   ├── stores/                   # Pinia状态管理
│   │   ├── agent.ts              # 智能体状态（4套人设、切换、上下文隔离）
│   │   ├── chat.ts               # 对话状态（消息、流式输出、会话隔离）
│   │   └── config.ts             # 配置状态（API地址、Token、模型）
│   ├── views/
│   │   └── MainLayout.vue        # 主布局（左栏+顶栏+对话区）
│   ├── components/
│   │   ├── AgentSwitch.vue       # 智能体切换栏（左侧竖排图标）
│   │   ├── TokenConfig.vue       # Token配置栏（顶部API/模型/Token）
│   │   └── AiChat.vue            # AI对话面板（消息列表+输入框+流式输出）
│   ├── utils/
│   │   ├── tauri-api.ts          # Tauri通信封装（类型安全的invoke调用）
│   │   └── ai-chat.ts            # AI流式对话封装（SSE流式输出）
│   └── assets/
│       └── styles/
│           ├── _variables.scss   # SCSS全局变量
│           └── global.scss       # 全局样式（Reset、滚动条、工具类）
└── src-tauri/                    # Rust后端源码
    ├── Cargo.toml                # Rust依赖配置
    ├── tauri.conf.json           # Tauri应用配置（窗口、打包）
    ├── build.rs                  # Tauri构建脚本
    └── src/
        ├── main.rs               # Rust入口
        ├── lib.rs                # 应用初始化（注册指令、插件）
        ├── commands.rs           # Tauri指令（存储、加密、AI代理、系统信息）
        ├── crypto.rs             # AES-256-GCM加密解密
        ├── storage.rs            # 本地文件存储（配置、Token持久化）
        └── error.rs              # 统一错误处理
```

## 🚀 快速启动

### 前置环境

| 工具 | 版本要求 | 安装方式 |
|------|---------|---------|
| Node.js | 18+ | https://nodejs.org |
| Rust | 1.80+ | https://rustup.rs |
| Tauri CLI | 2.x | `cargo install tauri-cli` |

### 安装步骤

```bash
# 1. 进入项目目录
cd tauri-ai-demo

# 2. 安装前端依赖
npm install

# 3. 开发模式启动（热更新）
npm run tauri dev

# 4. 构建生产版本
npm run tauri build
```

### 仅前端开发（无需Rust）

如果只想调试前端UI，可以跳过Tauri直接启动Vite：

```bash
npm install
npm run dev
# 浏览器访问 http://localhost:1420
```

> 注意：纯前端模式下，Tauri后端指令（加密存储等）不可用，会显示调用失败。完整功能需启动Tauri。

## 🔑 功能说明

### 已实现（Demo骨架）

| 功能 | 说明 |
|------|------|
| 项目骨架 | Tauri2+Vite+Vue3+TS完整工程，可直接编译运行 |
| 智能体切换 | 4套AI智能体（编程助手💻/运维助手🔧/数据分析📊/通用助手🤖），左侧栏切换 |
| Token加密存储 | AES-256-GCM加密，本地持久化，Rust后端处理 |
| AI流式对话 | SSE流式输出，打字机效果，上下文隔离 |
| 前后端通信 | Vue↔Rust双向invoke调用，类型安全封装 |
| 配置持久化 | API地址、模型选择、窗口状态本地存储 |

### 预留扩展接口

| 接口 | 位置 | 说明 |
|------|------|------|
| SSH连接 | `commands.rs` 预留 | 后续添加SSH协议指令 |
| RDP连接 | `commands.rs` 预留 | 后续添加RDP协议指令 |
| AI代理 | `ai_proxy_request` | 后续实现SSE请求转发 |
| 多窗口 | `tauri.conf.json` | 后续添加终端/RDP子窗口 |

## 🎨 UI布局

对齐 DEMO_SPEC.md 规范，参考 RustDesk 深色极简 + FinalShell 左侧面板：

```
┌──────────────────────────────────────────────────┐
│ [智能体栏56px] │  [工具栏48px: 智能体名 | API | 模型 | Token] │
│                │──────────────────────────────────│
│  💻 编程助手   │                                  │
│  🔧 运维助手   │    AI对话主面板                   │
│  📊 数据分析   │    (消息列表+流式输出+输入框)      │
│  🤖 通用助手   │                                  │
│                │                                  │
│  ⚙️ 设置      │  [输入框] [清空] [发送]           │
│                │──────────────────────────────────│
│                │  [状态栏24px: Token状态 | 模型 | 版本] │
└──────────────────────────────────────────────────┘

深色主题：主背景#1a1a2e / 侧栏#1e1e2e / 工具栏#252535
```

## 📦 技术栈

- **桌面框架**: Tauri 2 + Rust 1.80+
- **前端**: Vue 3.5 + Vite 6 + TypeScript 5.6
- **UI库**: Element Plus 2.9
- **状态管理**: Pinia 2.2
- **样式**: SCSS + CSS Variables
- **加密**: AES-256-GCM (Rust aes-gcm crate)
- **HTTP**: reqwest (Rust, 预留AI代理)

## ⚠️ 注意事项

1. **首次编译Rust较慢**：Cargo首次编译依赖约需3-5分钟，后续增量编译很快
2. **Token安全**：Demo版使用固定密钥种子，生产环境应使用机器指纹派生密钥
3. **AI API**：默认配置OpenAI API，需自行准备API Key；也支持DeepSeek等兼容API
4. **Windows开发**：需安装 Visual Studio Build Tools (C++ 桌面开发工作负载)

## 📝 开发规范

- Vue视图层 → TS业务层 → Tauri桥接层 → Rust底层，层级清晰
- 严格TS类型约束，禁止 `any`
- 所有IO/通信异步执行，不阻塞UI
- 隐私数据加密存储，Token/私钥严禁明文落地
- 代码注释使用中文，与业务语义对齐
