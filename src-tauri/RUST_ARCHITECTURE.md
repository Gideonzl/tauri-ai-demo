# Rust 底层协议内核 - 模块架构说明

> 作者：Rust 协议底层内核工程师
> 项目：Tauri 远程 SSH/RDP + AI 工具 Demo 极速版
> 规范对齐：DEMO_SPEC.md

## 一、模块总览

```
src-tauri/src/
├── main.rs              # Tauri 应用入口，注册所有指令
├── lib.rs               # 模块导出汇总
├── config/              # 应用运行时配置
│   └── mod.rs           # RuntimeConfig 定义与获取
├── crypto/              # 加密解密工具
│   └── mod.rs           # AES-256-GCM 加解密、Token 加密封装
├── storage/             # 本地文件存储
│   └── mod.rs           # AppConfig 持久化、Token 加密读写
├── commands/            # Tauri 全局指令
│   └── mod.rs           # 所有前端可调用的后端方法
├── error/               # 统一错误枚举
│   └── mod.rs           # ErrorCode + AppError + AppResult<T>
├── network/             # 网络请求（预留）
│   └── mod.rs           # HTTP 客户端、AI 代理、连接状态
├── protocol/            # 协议扩展（预留）
│   ├── mod.rs
│   ├── ssh/             # SSH2 协议（预留）
│   │   └── mod.rs       # SSH 连接/认证/终端/SFTP 接口
│   └── rdp/             # RDP3389 协议（预留）
│       └── mod.rs       # RDP 连接/鉴权/画面/输入 接口
└── ai/                  # AI 智能体模块
    └── mod.rs           # 智能体定义、上下文管理、SSE 预留
```

## 二、Tauri 指令清单（对齐 DEMO_SPEC.md 命名）

| 指令名 | 功能 | 状态 |
|--------|------|------|
| `save_token` | Token 加密存储 | ✅ |
| `load_token` | Token 解密读取 | ✅ |
| `delete_token` | Token 删除 | ✅ |
| `has_token` | Token 是否已配置 | ✅ |
| `save_config` | 保存应用配置 | ✅ |
| `load_config` | 读取应用配置 | ✅ |
| `ai_chat` | AI对话（普通模式） | ✅ Demo模拟 |
| `ai_chat_stream` | AI流式对话（SSE模式） | ✅ Demo模拟 |
| `get_system_info` | 系统信息 | ✅ |

## 三、4套内置智能体（对齐 DEMO_SPEC.md）

| ID | 名称 | 图标 | 定位 |
|----|------|------|------|
| `coding-assistant` | 编程助手 | 💻 | 代码开发、架构设计、技术选型 |
| `ops-assistant` | 运维助手 | 🔧 | 服务器运维、故障排查、性能优化 |
| `data-assistant` | 数据分析 | 📊 | 数据分析、SQL优化、可视化建模 |
| `general-assistant` | 通用助手 | 🤖 | 通用问答、文档撰写、日常辅助 |

## 四、SSE 流式对话协议

Rust 后端通过 Tauri Event 推送流式数据：

```
前端调用 ai_chat_stream → Rust 逐字推送：
  Event: "ai-stream-chunk"  → { agent_id, chunk, index }
  Event: "ai-stream-done"   → { agent_id, full_response }
```

前端监听：
```typescript
import { onAiStreamChunk, onAiStreamDone } from '@/api/tauri'

const unlisten = await onAiStreamChunk((data) => {
  // 逐字追加到消息区
  messageBuffer += data.chunk
})

await onAiStreamDone((data) => {
  // 流结束，完整响应在 data.full_response
  unlisten() // 取消监听
})
```

## 五、错误码规范

| 范围 | 模块 | 示例 |
|------|------|------|
| 1xxx | 通用错误 | INTERNAL_ERROR, INVALID_PARAM, IO_ERROR |
| 2xxx | 加密模块 | ENCRYPT_FAILED, DECRYPT_FAILED, INVALID_KEY |
| 3xxx | 存储模块 | CONFIG_NOT_FOUND, WRITE_FAILED, READ_FAILED |
| 4xxx | 网络模块 | CONNECTION_TIMEOUT, CONNECTION_REFUSED |
| 5xxx | AI模块 | AI_REQUEST_FAILED, AI_TOKEN_INVALID, AI_STREAM_INTERRUPTED |
| 6xxx | SSH协议 | SSH_HANDSHAKE_FAILED, SSH_AUTH_FAILED |
| 7xxx | RDP协议 | RDP_CONNECT_FAILED, RDP_AUTH_FAILED |

## 六、前端调用方式

```typescript
import { saveToken, loadToken, hasToken, aiChat, aiChatStream } from '@/api/tauri'

// Token 管理
await saveToken('sk-xxxxx')
const token = await loadToken()
const configured = await hasToken()

// AI 对话（普通模式）
const res = await aiChat({ agent_id: 'ops-assistant', message: '你好', history: [] })

// AI 对话（流式模式）
await aiChatStream({ agent_id: 'coding-assistant', message: '写个函数', history: [] })
```

## 七、后续扩展路径

1. **SSH 协议实现**：引入 `russh` crate，实现 `protocol::ssh::connect()` 等接口
2. **RDP 协议实现**：引入 `ironrdp` 或 FreeRDP binding，实现 `protocol::rdp::connect()` 等接口
3. **AI 真实接入**：引入 `reqwest` + `event-stream`，实现 `network::ai_stream_request()`
4. **机器码密钥**：生产环境替换 `MACHINE_SEED` 为真实机器特征码
5. **Tokio 异步化**：所有协议层操作基于 Tokio 异步实现，零阻塞
