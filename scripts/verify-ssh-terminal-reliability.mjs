import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')

const colorizer = read('src/utils/terminalColorizer.ts')
const dialog = read('src/components/SshConnectDialog.vue')
const ssh = read('src-tauri/src/protocol/ssh/mod.rs')
const theme = read('src/utils/theme.ts')
const store = read('src/stores/ssh.ts')
const api = read('src/api/tauri.ts')
const storage = read('src-tauri/src/storage/mod.rs')
const commands = read('src-tauri/src/commands/mod.rs')
const shellSession = read('src/sessions/SSHShellSession.ts')
const workspace = read('src/views/WorkspaceView.vue')
const sftpTree = read('src/components/SftpTree.vue')
const zhLocale = read('src/i18n/zh-CN.json')
const enLocale = read('src/i18n/en.json')

assert.ok(
  colorizer.includes('type ColorResolver = string | ((match: string) => string)'),
  '终端条件高亮必须接受颜色解析函数，不能将函数源码写入终端',
)
assert.ok(
  colorizer.includes("typeof color === 'function' ? color(m) : wrap(m, color)"),
  '终端条件高亮必须解析状态码对应的 ANSI 颜色',
)
assert.ok(
  dialog.includes('v-model="formData.keyPassphrase"'),
  '私钥认证必须允许填写私钥口令',
)
assert.ok(
  dialog.includes('passphrase: formData.keyPassphrase || undefined'),
  '私钥测试连接必须将口令传给 SSH 后端',
)
assert.ok(
  dialog.includes('class="host-dialog-footer"'),
  '测试、取消和保存操作必须使用统一页脚布局',
)
assert.ok(
  ssh.includes('fn normalize_key_path'),
  'SSH 后端必须在读取私钥前规范化用户目录路径',
)
assert.ok(
  ssh.includes('normalize_key_path(key_path)'),
  'SSH 私钥加载必须使用已规范化的路径',
)
assert.ok(
  theme.includes('terminal?: TerminalPalette'),
  '主题定义必须允许提供独立的终端 ANSI 色板',
)
assert.ok(
  theme.includes("source: 'iTerm2-Color-Schemes/Dracula'"),
  'Dracula 终端色板必须标注并使用指定开源仓库的配色',
)
assert.ok(
  theme.includes("source: 'iTerm2-Color-Schemes/Nord'"),
  'Nord 终端色板必须标注并使用指定开源仓库的配色',
)
assert.ok(dialog.includes('v-model="formData.keyContent"'), '私钥认证必须支持直接粘贴 PEM 内容')
assert.ok(dialog.includes('@drop.prevent="onKeyDrop"'), '私钥认证必须支持拖放本地密钥文件')
assert.ok(dialog.includes('onKeyFileSelected'), '私钥认证必须支持选择本地密钥文件')
assert.ok(api.includes('saveSshPrivateKey'), '前端必须能将私钥正文交给加密密钥库')
assert.ok(store.includes('keyRef?: string'), '主机配置必须只保存加密密钥库引用')
assert.ok(!store.includes('keyContent?: string'), '主机列表不得持久化私钥正文')
assert.ok(storage.includes('save_ssh_private_key'), '后端必须加密保存私钥正文')
assert.ok(commands.includes('hydrate_private_key'), 'SSH 命令必须在后端解析加密私钥引用')
assert.ok(ssh.includes('key_content: Option<String>'), 'SSH 认证结构必须支持内存私钥正文')
assert.ok(ssh.includes('decode_secret_key'), 'SSH 后端必须直接解析粘贴的私钥内容')
assert.ok(dialog.includes("const { t } = useLocale()"), '新建主机弹窗必须使用全局语言切换')
assert.ok(!dialog.includes('label="Name"'), '新建主机字段不得硬编码英文标签')
assert.ok(!dialog.includes("'Test Connection'"), '新建主机操作不得硬编码英文按钮文案')
for (const key of ['keyContent', 'keyPassphrase', 'loadLocalKey', 'dragKeyHere', 'remark']) {
  assert.ok(zhLocale.includes(`\"${key}\"`), `中文语言包缺少 SSH ${key} 文案`)
  assert.ok(enLocale.includes(`\"${key}\"`), `英文语言包缺少 SSH ${key} 文案`)
}
assert.ok(ssh.includes('oneshot::Sender<AppResult<()>>'), '交互终端写入必须确认远端 PTY 是否实际接收')
assert.ok(ssh.includes('reconnect_shell_session'), '交互终端失效后必须自动重连并重建 PTY')
assert.ok(ssh.includes('send_shell_input'), '交互终端必须通过可确认的写入链路发送输入')
assert.ok(ssh.includes('Shell write timed out'), '交互终端写入不能无限期卡住')
assert.ok(shellSession.includes('private writeQueue: Promise<void> = Promise.resolve()'), '重连期间终端输入必须顺序发送，不能并发落入旧 PTY')
assert.ok(shellSession.includes('this.writeQueue = this.writeQueue'), '终端输入必须串行等待上一次写入或重连完成')
assert.ok(
  ssh.includes('Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None'),
  '空闲 SSH 终端必须同时识别 EOF 和 Close，不能向已经关闭的 PTY 写入数据',
)
assert.ok(
  ssh.includes('Ok(Some(ChannelMsg::Eof)) | Ok(Some(ChannelMsg::Close)) | Ok(None) => break'),
  '文件列表和命令执行必须在 SSH Close 后结束读取，不能无限等待',
)
assert.ok(
  workspace.includes('const isTauri = isTauriMode'),
  'Tauri v2 连接失败不得错误回退为演示模式',
)
assert.ok(
  !workspace.includes('const { register, unregister } = useContextMenu() || !!(window as any).__TAURI_INTERNALS__'),
  '连接处理不得覆盖上下文菜单变量或误用 Tauri 运行时标识',
)
assert.ok(
  /onMounted\(async \(\) => \{\s*\/\/ The active workspace session[\s\S]*?handleRefresh\(\)/.test(sftpTree),
  '连接会话后文件树必须主动读取远端根目录，不能只显示模拟文件',
)

console.log('SSH and terminal reliability checks passed')
