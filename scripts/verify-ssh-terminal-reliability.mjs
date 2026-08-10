import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')

const colorizer = read('src/utils/terminalColorizer.ts')
const dialog = read('src/components/SshConnectDialog.vue')
const ssh = read('src-tauri/src/protocol/ssh/mod.rs')
const theme = read('src/utils/theme.ts')

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

console.log('SSH and terminal reliability checks passed')
