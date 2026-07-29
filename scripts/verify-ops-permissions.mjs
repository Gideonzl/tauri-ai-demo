import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-permission.ts')
const storePath = resolve(root, 'src/stores/opsAgent.ts')

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

assert.ok(existsSync(storePath), 'opsAgent.ts must exist')
const storeSource = readFileSync(storePath, 'utf8')
assert.match(storeSource, /MAX_AUDIT_EVENTS\s*=\s*200/, 'audit history must be capped at 200 events')
assert.match(storeSource, /AUDIT_RETENTION_MS\s*=\s*90\s*\*\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/, 'audit retention must be 90 days')
assert.match(storeSource, /function summarizeOutput/, 'audit output must be summarized')
assert.match(storeSource, /password|token|secret|authorization/i, 'audit output must redact sensitive values')
assert.match(storeSource, /slice\(0,\s*500\)/, 'audit output must be truncated to 500 characters')

console.log('Ops permission policy checks passed')
