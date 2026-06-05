# Tauri远程SSH/RDP+AI工具 — Termius极简UI改版规范

> **文档性质：** Termius风格改版唯一设计与验收标准  
> **制定人：** 产品设计UI验收总师  
> **制定时间：** 2026-06-02  
> **迭代模式：** 基于现有Demo框架升级，禁止重构底层  
> **开发周期：** 2小时

---

## 一、Termius视觉体系对标

### 1.1 Termius核心设计语言

Termius的视觉DNA：**极简、深色、低饱和度、高对比度文字、无装饰、纯功能导向**

| 维度 | Termius特征 | 我们的改版方向 |
|------|------------|---------------|
| 整体风格 | 深色极简商务，零装饰 | 全局删除emoji/花哨图标/多余装饰 |
| 色彩 | 低饱和冷色调，深灰蓝系 | 从#1a1a2e紫蓝系→#1b1b2f冷灰蓝系 |
| 布局 | 左侧窄导航+中间列表+右侧面板 | 固定三栏：左菜单+中间工作区+右AI面板 |
| 图标 | 线性图标，无emoji，单色 | SVG线性图标替换所有emoji |
| 间距 | 紧凑但不拥挤，8px基准 | 8px网格系统，紧凑商务风 |
| 字体 | 系统字体栈，14px基准 | 保持系统字体栈，层级清晰 |
| 圆角 | 小圆角4-6px，不花哨 | 统一4px/6px，禁止大圆角 |
| 按钮 | 扁平/微凸，低存在感 | 扁平按钮，hover微亮 |

### 1.2 全局色彩体系（Termius深色极简）

```scss
// === 主色调 — Termius冷灰蓝系 ===
$color-bg-base: #1b1b2f;        // 最深底色（主背景）
$color-bg-surface: #22223a;     // 表面色（卡片/面板）
$color-bg-elevated: #2a2a45;    // 抬起色（弹层/抽屉）
$color-bg-hover: rgba(255, 255, 255, 0.06);  // 悬停态
$color-bg-active: rgba(255, 255, 255, 0.10); // 激活态
$color-bg-input: #1e1e36;       // 输入框背景

// === 文字色 — 高对比度 ===
$color-text-primary: #e8e8f0;   // 主文字（白偏蓝）
$color-text-secondary: #8888a0; // 次要文字
$color-text-tertiary: #555570;  // 三级文字/占位符
$color-text-inverse: #ffffff;   // 反色文字

// === 功能色 — 低饱和度 ===
$color-accent: #5b8def;         // 主强调色（冷蓝，非EP默认蓝）
$color-accent-hover: #6d9cf2;   // 强调hover
$color-success: #4caf7d;        // 成功（低饱和绿）
$color-warning: #d4a24e;        // 警告（低饱和黄）
$color-danger: #d45454;         // 危险（低饱和红）

// === 边框/分割 ===
$color-border: rgba(255, 255, 255, 0.08);    // 常规边框
$color-border-light: rgba(255, 255, 255, 0.04); // 轻边框
$color-divider: rgba(255, 255, 255, 0.06);   // 分割线

// === 侧栏专用 ===
$color-sidebar-bg: #181830;     // 侧栏背景（最深）
$color-sidebar-icon: #8888a0;   // 侧栏图标色
$color-sidebar-icon-active: #5b8def; // 侧栏激活图标色
$color-sidebar-indicator: #5b8def;   // 侧栏激活指示条
```

### 1.3 字体层级

```scss
$font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;

// 字号层级（紧凑商务风）
$font-size-xs: 11px;    // 状态栏/辅助信息
$font-size-sm: 12px;    // 次要文字/标签
$font-size-base: 13px;  // 正文基准（Termius风格偏小）
$font-size-md: 14px;    // 主内容
$font-size-lg: 16px;    // 标题
$font-size-xl: 18px;    // 大标题

// 字重
$font-weight-normal: 400;
$font-weight-medium: 500;  // 标题/强调
$font-weight-semibold: 600; // 大标题
```

### 1.4 间距系统（8px网格）

```scss
$spacing-unit: 8px;
$spacing-xs: 4px;    // 极小间距
$spacing-sm: 8px;    // 小间距
$spacing-md: 12px;   // 中间距
$spacing-lg: 16px;   // 大间距
$spacing-xl: 24px;   // 超大间距
$spacing-2xl: 32px;  // 区块间距
```

### 1.5 圆角规范

```scss
$radius-none: 0;
$radius-sm: 4px;     // 按钮/输入框
$radius-md: 6px;     // 卡片/面板
$radius-lg: 8px;     // 弹窗/抽屉
$radius-full: 50%;   // 头像/状态点
```

---

## 二、固定三栏布局规范

### 2.1 整体布局结构

```
┌─────────────────────────────────────────────────────────────────┐
│  窗口标题栏 (原生装饰，无自定义)                                  │
├──────────┬──────────────────────────────┬───────────────────────┤
│ 左侧菜单栏 │  中间服务器连接工作区          │  右侧AI对话面板       │
│  56px固定  │  flex:1 自适应               │  320px 可收起         │
│           │                              │                       │
│ [连接]    │  ┌────────────────────────┐  │  [智能体切换标签]      │
│ [AI管理]  │  │  连接列表/空状态        │  │                       │
│ [终端]    │  │                        │  │  消息列表(scroll)     │
│ [SFTP]    │  │  (Demo期显示空状态)     │  │                       │
│           │  └────────────────────────┘  │  ─────────────────── │
│           │                              │  输入框 + 发送按钮     │
│ ────────  │  ┌────────────────────────┐  │                       │
│ [设置]    │  │  底部状态栏 24px        │  │                       │
│           │  └────────────────────────┘  │                       │
└──────────┴──────────────────────────────┴───────────────────────┘
```

### 2.2 布局尺寸锁定

| 区域 | 宽度 | 高度 | 特性 |
|------|------|------|------|
| 左侧菜单栏 | 56px固定 | 100% | 不可拖拽调整，图标+文字竖排 |
| 中间工作区 | flex:1 | 100% | 自适应填充，含底部状态栏 |
| 右侧AI面板 | 320px | 100% | 可收起（收起后仅保留40px触发条） |
| AI面板收起态 | 40px | 100% | 仅显示展开按钮 |
| 底部状态栏 | 100% | 24px | 中间工作区内底部 |
| 窗口最小尺寸 | 960px | 600px | 三栏最小可用宽度 |

### 2.3 右侧AI面板收起/展开逻辑

- **默认状态：** 展开（320px）
- **收起触发：** 点击面板顶部收起按钮 → 面板宽度动画过渡到40px
- **展开触发：** 点击40px触发条 → 面板宽度动画过渡到320px
- **过渡动画：** `transition: width 0.25s ease`
- **收起态内容：** 仅显示竖排"AI"文字 + 展开箭头图标
- **状态持久化：** Pinia记录面板展开/收起状态，重启恢复

---

## 三、左侧菜单栏规范

### 3.1 菜单项定义

| 序号 | 菜单项 | 图标(SVG线性) | 路由 | 说明 |
|------|--------|--------------|------|------|
| 1 | 连接 | `icon-connection` | `/connections` | 服务器连接列表（Demo期空状态） |
| 2 | AI管理 | `icon-ai-settings` | `/ai-models` | AI模型配置独立页面 |
| 3 | 终端 | `icon-terminal` | `/terminal` | 终端标签页（Demo期预留） |
| 4 | SFTP | `icon-folder` | `/sftp` | 文件传输（Demo期预留） |
| ─ | ─ 分割线 ─ | ─ | ─ | ─ |
| 5 | 设置 | `icon-settings` | `/settings` | 应用设置 |

### 3.2 菜单栏样式

- **背景色：** `$color-sidebar-bg` (#181830)
- **菜单项尺寸：** 56x48px，垂直居中
- **图标：** 20x20px SVG线性图标，色`$color-sidebar-icon`
- **文字：** 10px，色`$color-sidebar-icon`，图标下方2px
- **选中态：** 
  - 左侧2px宽`$color-sidebar-indicator`竖条
  - 图标色→`$color-sidebar-icon-active`
  - 文字色→`$color-sidebar-icon-active`
  - 背景→`$color-bg-active`
- **悬停态：** 背景→`$color-bg-hover`
- **分割线：** 1px `rgba(255,255,255,0.06)`，距左右8px

### 3.3 SVG线性图标规范

**禁止使用emoji！** 全部替换为SVG线性图标：

| 原emoji | 替换SVG图标 | 说明 |
|---------|------------|------|
| 💻 | `icon-code` (代码符号</> | 编程助手 |
| 🔧 | `icon-wrench` (扳手) | 运维助手 |
| 📊 | `icon-chart` (柱状图) | 数据分析 |
| 🤖 | `icon-bot` (机器人轮廓) | 通用助手 |
| ⚙️ | `icon-settings` (齿轮) | 设置 |
| 👤 | `icon-user` (人轮廓) | 用户头像 |

图标风格：24x24 viewBox，stroke-width 1.5，stroke-linecap round，单色填充

---

## 四、中间服务器连接工作区

### 4.1 连接列表页（/connections）

Demo期显示空状态：

```
┌──────────────────────────────────────┐
│                                      │
│         [icon-connection-large]      │
│                                      │
│       暂无服务器连接                  │
│   点击 + 添加你的第一个连接           │
│                                      │
│         [ + 新建连接 ]               │
│                                      │
└──────────────────────────────────────┘
```

- 空状态图标：48x48px，`$color-text-tertiary`
- 空状态文字：`$font-size-md`，`$color-text-secondary`
- 新建连接按钮：`$color-accent`主色按钮

### 4.2 底部状态栏

- **背景色：** `$color-bg-surface`
- **高度：** 24px
- **左侧：** 连接状态点(6px圆) + "就绪"文字
- **中间：** 当前AI模型名称
- **右侧：** 版本号 "v0.2.0"
- **字号：** `$font-size-xs` (11px)
- **文字色：** `$color-text-tertiary`

---

## 五、右侧AI对话面板规范

### 5.1 面板结构

```
┌─────────────────────────┐
│ 面板头部 40px             │
│ [智能体标签切换] [收起按钮] │
├─────────────────────────┤
│ 消息列表 (scroll)        │
│                         │
│ 用户消息 → 右对齐         │
│ AI消息 ← 左对齐          │
│                         │
├─────────────────────────┤
│ 输入区域                 │
│ textarea + 发送按钮      │
└─────────────────────────┘
```

### 5.2 面板头部（40px）

- **背景色：** `$color-bg-surface`
- **左侧：** 智能体切换标签（4个tab，紧凑排列）
  - 标签样式：文字+小图标，无emoji
  - 选中态：底部2px `$color-accent` 横线
  - 字号：`$font-size-sm` (12px)
- **右侧：** 收起按钮（chevron-right图标）

### 5.3 消息气泡样式（Termius简约风）

**用户消息：**
- 对齐：右对齐
- 气泡色：`$color-accent` 透明度15% → `rgba(91, 141, 239, 0.15)`
- 文字色：`$color-text-primary`
- 圆角：`$radius-md` 6px
- 最大宽度：85%
- 无头像（Termius风格极简）

**AI消息：**
- 对齐：左对齐
- 气泡色：`$color-bg-elevated` (#2a2a45)
- 文字色：`$color-text-primary`
- 圆角：`$radius-md` 6px
- 左侧3px `$color-accent` 竖条（标识AI来源）
- 最大宽度：90%

**流式输出光标：**
- 闪烁竖线 `▎`，色`$color-accent`
- 动画：0.8s blink

### 5.4 输入区域

- **背景色：** `$color-bg-surface`
- **上边框：** 1px `$color-border`
- **textarea：** 
  - 背景：`$color-bg-input`
  - 最小高度：60px，最大160px
  - 字号：`$font-size-base` (13px)
  - placeholder：`$color-text-tertiary`
  - 无边框，focus时底部1px `$color-accent`
- **发送按钮：** 
  - 右下角，32x32px
  - 图标：`icon-send` (箭头)
  - 色彩：`$color-accent`
  - 禁用态：`$color-text-tertiary`

---

## 六、AI模型管理独立页面（/ai-models）

### 6.1 页面结构

```
┌──────────────────────────────────────────┐
│ 页面标题栏 48px                            │
│ "AI 模型管理"              [+ 新增配置]   │
├──────────────────────────────────────────┤
│ 配置列表                                  │
│                                          │
│ ┌────────────────────────────────────┐   │
│ │ 配置卡片 1                          │   │
│ │ 厂商: DeepSeek    模型: deepseek-chat│   │
│ │ 地址: https://api.deepseek.com/v1  │   │
│ │ Token: sk-****abcd                 │   │
│ │ [默认✓] [编辑] [测试] [删除]        │   │
│ └────────────────────────────────────┘   │
│                                          │
│ ┌────────────────────────────────────┐   │
│ │ 配置卡片 2                          │   │
│ │ 厂商: OpenAI    模型: gpt-4o-mini   │   │
│ │ ...                                │   │
│ └────────────────────────────────────┘   │
│                                          │
└──────────────────────────────────────────┘
```

### 6.2 新增/编辑配置表单

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| 厂商 | 下拉选择 | 是 | OpenAI / DeepSeek / 通义千问 / 智谱AI / 百度千帆 / 自定义 |
| 配置名称 | 输入框 | 是 | 用户自定义名称，如"我的DeepSeek" |
| API地址 | 输入框 | 是 | 选择厂商后自动填充默认地址，可修改 |
| 模型名称 | 输入框 | 是 | 选择厂商后自动填充默认模型，可修改 |
| API Token | 密码输入框 | 是 | sk-...格式，可切换显示/隐藏 |
| 请求超时 | 数字输入 | 否 | 默认30秒，范围5-120秒 |
| 设为默认 | 开关 | 否 | 仅一个配置可设为默认 |

### 6.3 厂商预设配置

| 厂商 | 默认API地址 | 默认模型 | 协议类型 |
|------|------------|---------|---------|
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | OpenAI兼容 |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | OpenAI兼容 |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | OpenAI兼容 |
| 智谱AI | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` | OpenAI兼容 |
| 百度千帆 | `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop` | `ernie-4.0-8k` | 百度原生 |
| 自定义 | (空) | (空) | OpenAI兼容 |

### 6.4 连通性测试

- **触发：** 点击"测试"按钮
- **逻辑：** 调用Rust后端 `test_ai_connection` 指令
- **请求：** 使用当前配置的地址+Token+模型，发送最小请求 `{"model":"xxx","messages":[{"role":"user","content":"hi"}],"max_tokens":1}`
- **结果展示：**
  - 成功：绿色✓ + "连接成功 (耗时xxxms)"
  - 失败：红色✗ + 具体错误信息（密钥错误/地址错误/超时/模型不存在）

### 6.5 配置卡片样式

- **背景色：** `$color-bg-surface`
- **边框：** 1px `$color-border`
- **圆角：** `$radius-md` (6px)
- **内间距：** `$spacing-lg` (16px)
- **默认配置标识：** 左上角小标签"默认"，色`$color-accent`
- **操作按钮：** 扁平文字按钮，无背景，hover时`$color-bg-hover`

---

## 七、需要删除的零散AI配置入口

| 位置 | 删除内容 | 原因 |
|------|---------|------|
| TokenConfig.vue | 整个组件删除 | AI配置收口到独立页面 |
| MainLayout.vue 顶部工具栏 | TokenConfig引用删除 | 不再在顶部显示AI配置 |
| AiChat.vue | 消息中emoji头像 | 替换为SVG图标 |
| AgentSwitch.vue | emoji图标 | 替换为SVG线性图标 |
| agent.ts store | icon字段emoji | 替换为SVG图标名 |
| types/tauri.ts | AGENT_LIST中emoji | 替换为SVG图标名 |

---

## 八、智能体定义更新（去emoji）

| ID | 名称 | 图标(SVG) | 人设Prompt摘要 |
|----|------|----------|---------------|
| coding-assistant | 编程助手 | `icon-code` | 资深编程专家，精通Rust/TS/Vue3/Tauri... |
| ops-assistant | 运维助手 | `icon-wrench` | 运维工程师，擅长Linux/Docker/K8s... |
| data-assistant | 数据分析 | `icon-chart` | 数据分析专家，擅长Python/SQL/可视化... |
| general-assistant | 通用助手 | `icon-bot` | 全能AI助手，问答/写作/翻译... |

---

## 九、前后端新增接口

### 9.1 Rust后端新增指令

| 指令名 | 参数 | 返回 | 说明 |
|--------|------|------|------|
| `list_ai_configs` | 无 | `Vec<AiModelConfig>` | 读取全部AI配置 |
| `save_ai_config` | `AiModelConfig` | `()` | 新增/编辑AI配置 |
| `delete_ai_config` | `{id: String}` | `()` | 删除AI配置 |
| `set_default_ai_config` | `{id: String}` | `()` | 设为默认配置 |
| `test_ai_connection` | `AiModelConfig` | `TestResult` | 连通性测试 |

### 9.2 AiModelConfig数据结构

```rust
pub struct AiModelConfig {
    pub id: String,              // UUID
    pub name: String,            // 用户自定义名称
    pub vendor: String,          // 厂商: openai/deepseek/qwen/zhipu/baidu/custom
    pub api_base: String,        // API地址
    pub model: String,           // 模型名称
    pub api_token_encrypted: String, // 加密Token
    pub timeout_secs: u32,       // 超时秒数
    pub is_default: bool,        // 是否默认
    pub created_at: u64,         // 创建时间
}
```

### 9.3 TestResult数据结构

```rust
pub struct TestResult {
    pub success: bool,
    pub latency_ms: Option<u64>,
    pub error: Option<String>,   // 错误类型: token_invalid/url_error/timeout/model_not_found/quota_exceeded
}
```

---

## 十、验收标准

### 10.1 UI验收

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | 全局无emoji | 搜索源码无任何emoji字符 |
| 2 | Termius深色风格 | 色值/间距/圆角/字体全部对齐本文档 |
| 3 | 三栏布局固定 | 左56px+中flex+右320px，窗口缩放不错乱 |
| 4 | AI面板可收起 | 收起→40px触发条，展开→320px，动画流畅 |
| 5 | SVG线性图标 | 所有图标为SVG，风格统一 |

### 10.2 功能验收

| # | 验收项 | 通过标准 |
|---|--------|----------|
| 1 | AI配置独立 | 仅AI管理页有Token/接口配置，其他页面无 |
| 2 | 多模型CRUD | 可新增/编辑/删除多组配置 |
| 3 | 设为默认 | 切换默认配置，AI对话自动使用 |
| 4 | 连通测试 | 测试按钮可用，成功/失败正确展示 |
| 5 | 配置持久化 | 重启软件配置不丢失 |
| 6 | 智能体切换 | 4套智能体正常切换，对话隔离 |
| 7 | 流式对话 | AI对话流式输出正常 |

### 10.3 兼容性验收

| # | 厂商 | 验收项 |
|---|------|--------|
| 1 | OpenAI兼容 | 地址/Token/模型配置正确，请求格式兼容 |
| 2 | DeepSeek | 原生接口正常 |
| 3 | 通义千问 | compatible-mode地址正确 |
| 4 | 智谱AI | v4接口地址正确 |
| 5 | 百度千帆 | 原生接口适配（如有Token可测） |

---

**本文档为Termius改版唯一标准来源，所有实现必须严格遵循。**
