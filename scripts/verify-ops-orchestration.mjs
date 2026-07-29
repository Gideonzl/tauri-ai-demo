import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-orchestration.ts')
assert.ok(existsSync(sourcePath), 'ops-orchestration.ts must exist')

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

const orchestrationModule = { exports: {} }
new Function('exports', 'module', 'require', compile(readFileSync(sourcePath, 'utf8'), sourcePath))(
  orchestrationModule.exports,
  orchestrationModule,
  (id) => {
    if (id === '@/utils/ops-permission') return policyModule.exports
    throw new Error(`Unexpected import: ${id}`)
  },
)

const orchestration = orchestrationModule.exports

const targets = [
  { hostId: 'h1', hostName: 'web-1', hostAddress: 'root@10.0.0.1' },
  { hostId: 'h2', hostName: 'web-2', hostAddress: 'root@10.0.0.2' },
  { hostId: 'h3', hostName: 'web-3', hostAddress: 'root@10.0.0.3' },
]

const commandTask = orchestration.createCommandTask({
  mode: 'batch',
  title: 'Batch disk check',
  command: 'df -h',
  targets,
  concurrency: 2,
})

assert.equal(commandTask.mode, 'batch')
assert.equal(commandTask.taskType, 'command')
assert.equal(commandTask.concurrency, 2)
assert.equal(commandTask.targets.length, 3)
assert.equal(commandTask.steps[0].risk, 'read_only')
assert.equal(orchestration.validateOrchestrationTask(commandTask).valid, true)

const invalidChange = orchestration.createCommandTask({
  mode: 'batch',
  title: 'Restart without verify',
  command: 'systemctl restart nginx',
  targets,
  concurrency: 2,
})
assert.equal(orchestration.validateOrchestrationTask(invalidChange).valid, false)
assert.match(orchestration.validateOrchestrationTask(invalidChange).errors.join('\n'), /verifyCommand/)

let active = 0
let maxActive = 0
const ordered = await orchestration.runWithConcurrency([1, 2, 3, 4], 2, async (item) => {
  active += 1
  maxActive = Math.max(maxActive, active)
  await new Promise(resolve => setTimeout(resolve, 5))
  active -= 1
  return item * 10
})
assert.deepEqual(ordered, [10, 20, 30, 40])
assert.equal(maxActive <= 2, true)

const failedTask = {
  ...commandTask,
  targets: commandTask.targets.map((target, index) => ({ ...target, status: index === 0 ? 'failed' : 'pending' })),
}
assert.equal(orchestration.shouldStopRemaining(failedTask, failedTask.targets[0]), false)

const changeTask = {
  ...commandTask,
  taskType: 'command',
  steps: [{ ...commandTask.steps[0], risk: 'change', verifyCommand: 'systemctl is-active nginx', stopOnFailure: true, status: 'failed' }],
}
assert.equal(orchestration.shouldStopRemaining(changeTask, changeTask.steps[0]), true)

const summary = orchestration.summarizeOrchestration({
  ...commandTask,
  targets: commandTask.targets.map((target, index) => ({ ...target, status: index === 1 ? 'failed' : 'completed', summary: index === 1 ? 'boom' : 'ok' })),
})
assert.match(summary, /web-1/)
assert.match(summary, /web-2/)
assert.match(summary, /boom/)

console.log('Ops orchestration checks passed')
