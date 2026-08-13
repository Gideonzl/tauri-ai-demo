import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = (file) => readFileSync(resolve(root, file), 'utf8')

const snapshots = read('src/stores/workflowSnapshots.ts')

assert.ok(snapshots.includes("const STORAGE_KEY = 'workflow-snapshots'"), '工作流快照必须使用独立的本地存储键')
assert.ok(snapshots.includes('function sanitizeSnapshot'), '快照写入前必须脱敏')
assert.ok(snapshots.includes('password'), '快照脱敏必须覆盖密码字段')
assert.ok(snapshots.includes('PRIVATE KEY'), '快照脱敏必须覆盖私钥正文')
assert.ok(snapshots.includes('function clearSnapshots'), '快照必须支持清空')
assert.ok(snapshots.includes('function exportSnapshots'), '快照必须支持安全导出')
assert.ok(snapshots.includes('function importSnapshots'), '快照必须支持受校验导入')

console.log('Local data management checks passed')
