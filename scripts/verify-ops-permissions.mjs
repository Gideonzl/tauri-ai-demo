import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-permission.ts')

assert.ok(existsSync(sourcePath), 'ops-permission.ts must exist')

const source = readFileSync(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2021,
  },
})
const policyModule = { exports: {} }
new Function('exports', 'module', compiled.outputText)(policyModule.exports, policyModule)

const { classifyCommand, evaluateCommand } = policyModule.exports

assert.equal(classifyCommand('df -h').risk, 'read_only')
assert.equal(classifyCommand('systemctl restart nginx').risk, 'change')
assert.equal(classifyCommand('rm -rf /var/tmp/cache').risk, 'high_risk')
assert.equal(evaluateCommand(classifyCommand('df -h'), 'readonly', []).action, 'allow')
assert.equal(evaluateCommand(classifyCommand('systemctl restart nginx'), 'readonly', []).action, 'deny')
assert.equal(evaluateCommand(classifyCommand('systemctl restart nginx'), 'controlled', []).action, 'confirm')
assert.equal(evaluateCommand(classifyCommand('rm -rf /var/tmp/cache'), 'elevated', []).action, 'double_confirm')

console.log('Ops permission policy checks passed')
