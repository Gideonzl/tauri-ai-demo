import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')

const snapshots = read('src/stores/workflowSnapshots.ts')
const chat = read('src/components/AiChat.vue')
const history = read('src/views/CommandHistoryView.vue')
const settings = read('src/views/SettingsView.vue')
const zhLocale = read('src/i18n/zh-CN.json')
const enLocale = read('src/i18n/en.json')

assert.ok(snapshots.includes("const STORAGE_KEY = 'workflow-snapshots'"), '工作流快照必须使用独立的本地存储键')
assert.ok(snapshots.includes('function sanitizeSnapshot'), '快照写入前必须脱敏')
assert.ok(snapshots.includes('password'), '快照脱敏必须覆盖密码字段')
assert.ok(snapshots.includes('PRIVATE KEY'), '快照脱敏必须覆盖私钥正文')
assert.ok(snapshots.includes('function clearSnapshots'), '快照必须支持清空')
assert.ok(snapshots.includes('function exportSnapshots'), '快照必须支持安全导出')
assert.ok(snapshots.includes('function importSnapshots'), '快照必须支持受校验导入')
assert.ok(chat.includes('saveAsSnapshot'), 'AI 消息菜单必须允许保存快照')
assert.ok(history.includes('saveAsSnapshot'), '命令历史菜单必须允许保存快照')
assert.ok(settings.includes('showSnapshots'), '设置页必须可展开快照列表')
assert.ok(settings.includes('importSnapshotToTerminal'), '设置页必须允许快照导入终端')
assert.ok(settings.includes('sendSnapshotToAi'), '设置页必须允许快照发送给 AI')
assert.ok(zhLocale.includes('"saveSnapshot"'), '中文语言包必须包含快照保存文案')
assert.ok(enLocale.includes('"saveSnapshot"'), '英文语言包必须包含快照保存文案')

console.log('Local data management checks passed')
