import assert from 'node:assert/strict'
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import ts from 'typescript'

const root = resolve(import.meta.dirname, '..')
const sourcePath = resolve(root, 'src/utils/ops-remediation.ts')
const storePath = resolve(root, 'src/stores/remediation.ts')
const cardPath = resolve(root, 'src/components/RemediationPlanCard.vue')

assert.ok(existsSync(sourcePath), 'ops-remediation.ts must exist')
assert.ok(existsSync(storePath), 'remediation.ts must exist')
assert.ok(existsSync(cardPath), 'RemediationPlanCard.vue must exist')

function compile(source, modulePath) {
  const compiled = ts.transpileModule(source, {
    fileName: modulePath,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      esModuleInterop: true,
    },
  })
  return compiled.outputText
}

const tempDir = mkdtempSync(join(tmpdir(), 'ops-remediation-'))
try {
  const policyPath = resolve(root, 'src/utils/ops-permission.ts')
  const remediationSource = readFileSync(sourcePath, 'utf8')
  const policySource = readFileSync(policyPath, 'utf8')
  const policyModule = { exports: {} }
  new Function('exports', 'module', compile(policySource, policyPath))(policyModule.exports, policyModule)

  const remediationModule = { exports: {} }
  const compiledRemediation = compile(remediationSource, sourcePath)
  const requireMap = {
    '@/utils/ops-permission': policyModule.exports,
  }
  new Function('exports', 'module', 'require', compiledRemediation)(
    remediationModule.exports,
    remediationModule,
    (id) => {
      if (id in requireMap) return requireMap[id]
      throw new Error(`Unexpected import: ${id}`)
    },
  )

  const remediation = remediationModule.exports

  const invalid = {
    id: 'bad',
    hostId: 'host-1',
    hostName: 'demo',
    issueType: 'disk',
    title: 'Bad plan',
    evidence: [],
    steps: [{
      id: 's1',
      title: 'Clean',
      goal: 'free space',
      command: 'journalctl --vacuum-time=7d',
      verifyCommand: '',
      expectedResult: 'disk lower',
      risk: 'change',
      stopOnFailure: true,
      status: 'pending',
    }],
    createdAt: Date.now(),
    status: 'ready',
  }
  const invalidResult = remediation.validateRemediationPlan(invalid)
  assert.equal(invalidResult.valid, false)
  assert.match(invalidResult.errors.join('\n'), /verifyCommand/)

  const diskPlan = remediation.createConservativeRemediationPlan({
    hostId: 'host-1',
    hostName: 'demo',
    issueText: '磁盘满了，帮我修一下',
    diagnosticOutput: '/dev/vda1 40G 38G 2G 96% /\nJournal disk usage is 3.2G',
  })
  assert.equal(diskPlan.issueType, 'disk')
  assert.ok(diskPlan.steps.some((step) => step.command.includes('journalctl --vacuum-time=7d')))
  assert.ok(diskPlan.steps.every((step) => step.verifyCommand.trim().length > 0))

  const servicePlan = remediation.createConservativeRemediationPlan({
    hostId: 'host-1',
    hostName: 'demo',
    issueText: 'nginx 服务起不来，帮我修',
    diagnosticOutput: 'nginx.service failed',
  })
  assert.equal(servicePlan.issueType, 'service')
  assert.ok(servicePlan.steps.some((step) => step.command === 'systemctl restart nginx'))
  assert.ok(servicePlan.steps.some((step) => step.verifyCommand === 'systemctl is-active nginx && systemctl status nginx --no-pager -l | head -40'))

  const failedStep = { ...servicePlan.steps[0], status: 'failed' }
  assert.equal(remediation.shouldStopAfterStep(failedStep), true)

  const storeSource = readFileSync(storePath, 'utf8')
  assert.match(storeSource, /defineStore\('remediation'/, 'remediation store must exist')
  assert.match(storeSource, /setStepStatus/, 'store must update individual step status')
  assert.match(storeSource, /appendStepOutput/, 'store must persist step output summaries')
  assert.match(storeSource, /stopPlan/, 'store must support stopping a plan')

  const cardSource = readFileSync(cardPath, 'utf8')
  assert.match(cardSource, /defineProps<\{\s*plan: RemediationPlan/, 'plan card must receive a RemediationPlan')
  assert.match(cardSource, /defineEmits<\{\s*execute:/, 'plan card must emit execute')
  assert.match(cardSource, /verifyCommand/, 'plan card must show verification command')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}

console.log('Ops remediation checks passed')
