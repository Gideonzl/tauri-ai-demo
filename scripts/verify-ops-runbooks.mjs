import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-runbooks.ts')
const storePath = resolve(root, 'src/stores/runbooks.ts')
const batchPanelPath = resolve(root, 'src/views/ops/BatchPanel.vue')
const aiPanelPath = resolve(root, 'src/components/AiChat.vue')

assert.ok(existsSync(sourcePath), 'ops-runbooks.ts must exist')

function compile(source, modulePath) {
  return ts.transpileModule(source, {
    fileName: modulePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    },
  }).outputText
}

const policyPath = resolve(root, 'src/utils/ops-permission.ts')
const policyModule = { exports: {} }
new Function('exports', 'module', compile(readFileSync(policyPath, 'utf8'), policyPath))(policyModule.exports, policyModule)

const runbookModule = { exports: {} }
new Function('exports', 'module', 'require', compile(readFileSync(sourcePath, 'utf8'), sourcePath))(
  runbookModule.exports,
  runbookModule,
  (id) => {
    if (id === '@/utils/ops-permission') return policyModule.exports
    throw new Error(`Unexpected import: ${id}`)
  },
)

const {
  OPS_RUNBOOKS,
  getBatchRunbooks,
  getAiRunbookPrompts,
  getRunbookById,
  isSafeBatchRunbook,
  createCustomRunbook,
} = runbookModule.exports

assert.ok(Array.isArray(OPS_RUNBOOKS), 'OPS_RUNBOOKS must be exported')
assert.ok(OPS_RUNBOOKS.length >= 5, '至少需要 5 个内置运维剧本')
assert.equal(new Set(OPS_RUNBOOKS.map(item => item.id)).size, OPS_RUNBOOKS.length, '剧本 ID 必须唯一')

const batchRunbooks = getBatchRunbooks()
assert.ok(batchRunbooks.length >= 5, '批量页必须有安全命令剧本')
for (const runbook of batchRunbooks) {
  assert.ok(runbook.command, `${runbook.id} must include command`)
  assert.equal(policyModule.exports.classifyCommand(runbook.command).risk, 'read_only', `${runbook.id} 批量剧本必须保持只读`)
  assert.equal(isSafeBatchRunbook(runbook), true, `${runbook.id} must pass safe batch validation`)
}

assert.ok(getAiRunbookPrompts().length >= 5, 'AI 面板必须有剧本提示')
assert.equal(getRunbookById('fleet-health')?.id, 'fleet-health', '必须能按 ID 查找剧本')
assert.equal(createCustomRunbook({ title: 'safe', command: 'df -h', recommendedConcurrency: 2 }).valid, true, '只读命令必须允许保存为自定义剧本')
assert.equal(createCustomRunbook({ title: 'change', command: 'systemctl restart nginx', recommendedConcurrency: 2 }).valid, false, '变更命令不得保存为自定义剧本')
assert.equal(createCustomRunbook({ title: 'danger', command: 'rm -rf /tmp/demo', recommendedConcurrency: 2 }).valid, false, '高危命令不得保存为自定义剧本')

assert.ok(existsSync(storePath), 'runbooks store must exist')
const storeSource = readFileSync(storePath, 'utf8')
assert.ok(storeSource.includes("defineStore('runbooks'"), '自定义剧本必须使用 Pinia store')
assert.ok(storeSource.includes('CUSTOM_RUNBOOKS_KEY'), '自定义剧本必须持久化到本地存储')
assert.ok(storeSource.includes('addCustomRunbook'), 'store 必须支持新增自定义剧本')
assert.ok(storeSource.includes('removeCustomRunbook'), 'store 必须支持删除自定义剧本')
assert.ok(storeSource.includes('isSafeBatchRunbook'), 'store 必须保存前复核只读安全')

const batchPanel = readFileSync(batchPanelPath, 'utf8')
assert.ok(batchPanel.includes('useRunbookStore'), '批量页必须通过剧本 store 读取内置和自定义剧本')
assert.ok(batchPanel.includes('runbookStore.batchRunbooks'), '批量页必须读取合并后的剧本列表')
assert.ok(batchPanel.includes('applyRunbook'), '批量页必须能应用剧本到命令框')
assert.ok(batchPanel.includes('runbook.command'), '批量页必须使用剧本命令')
assert.ok(batchPanel.includes('saveCurrentAsRunbook'), '批量页必须能保存当前命令为自定义剧本')
assert.ok(batchPanel.includes('removeCustomRunbook'), '批量页必须能删除自定义剧本')

const aiPanel = readFileSync(aiPanelPath, 'utf8')
assert.ok(aiPanel.includes('getAiRunbookPrompts'), 'AI 面板必须读取剧本提示')
assert.ok(aiPanel.includes('runbook.promptKey'), 'AI 快捷入口必须使用剧本提示')

console.log('Ops runbook checks passed')
