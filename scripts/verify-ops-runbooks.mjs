import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-runbooks.ts')
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

const batchPanel = readFileSync(batchPanelPath, 'utf8')
assert.ok(batchPanel.includes('getBatchRunbooks'), '批量页必须读取内置剧本')
assert.ok(batchPanel.includes('applyRunbook'), '批量页必须能应用剧本到命令框')
assert.ok(batchPanel.includes('runbook.command'), '批量页必须使用剧本命令')

const aiPanel = readFileSync(aiPanelPath, 'utf8')
assert.ok(aiPanel.includes('getAiRunbookPrompts'), 'AI 面板必须读取剧本提示')
assert.ok(aiPanel.includes('runbook.promptKey'), 'AI 快捷入口必须使用剧本提示')

console.log('Ops runbook checks passed')
