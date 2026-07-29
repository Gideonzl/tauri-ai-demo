import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

const variables = readFileSync(resolve(root, 'src/assets/styles/_variables.scss'), 'utf8')
const global = readFileSync(resolve(root, 'src/assets/styles/global.scss'), 'utf8')
const theme = readFileSync(resolve(root, 'src/utils/theme.ts'), 'utf8')
const config = readFileSync(resolve(root, 'src/stores/config.ts'), 'utf8')
const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8')
const mainLayout = readFileSync(resolve(root, 'src/views/MainLayout.vue'), 'utf8')
const sideNav = readFileSync(resolve(root, 'src/components/SideNav.vue'), 'utf8')
const opsView = readFileSync(resolve(root, 'src/views/OpsView.vue'), 'utf8')
const batchPanel = readFileSync(resolve(root, 'src/views/ops/BatchPanel.vue'), 'utf8')

function assertIncludes(source, needle, message) {
  assert.ok(source.includes(needle), message)
}

assertIncludes(variables, '$neon-cyan', 'SCSS 必须提供霓虹青色令牌')
assertIncludes(variables, '$neon-violet', 'SCSS 必须提供霓虹紫色令牌')
assertIncludes(variables, '$glow-cyan', 'SCSS 必须提供灯管青色光晕')
assertIncludes(theme, "'neon-ops'", '运行时主题必须包含 neon-ops 调色板')
assertIncludes(config, "ref<ColorScheme>('neon-ops')", '默认配置主题必须切到 neon-ops')
assertIncludes(config, 'design-neon-v1', '必须有一次性迁移让旧默认用户看到新 UI')
assertIncludes(main, "applyTheme('neon-ops')", '应用启动早期主题必须默认 neon-ops')
assertIncludes(global, 'background-attachment: fixed', '全局背景必须有固定霓虹氛围层')
assertIncludes(global, '.el-button--primary', 'Element Plus 主按钮必须统一霓虹化')

assertIncludes(mainLayout, 'shell-aurora', '主布局必须有霓虹氛围光层')
assertIncludes(mainLayout, 'tb-status-strip', '顶部栏必须重排为状态胶囊布局')
assertIncludes(mainLayout, 'cmd-fab-ring', 'AI 悬浮按钮必须有灯管环形光效')

assertIncludes(sideNav, 'nav-icon-shell', '侧边栏图标必须有胶囊灯管容器')
assertIncludes(sideNav, 'rail-glow', '侧边栏必须有纵向发光轨道')

assertIncludes(opsView, 'ops-hero', '智能运维页必须有驾驶舱 Hero 区')
assertIncludes(opsView, 'ops-tab-label', '智能运维页按钮必须重排为胶囊标签')
assertIncludes(batchPanel, 'bp-runbook-chip', '批量页剧本按钮必须保留可视化胶囊')
assertIncludes(batchPanel, 'bp-runbook-delete', '自定义剧本删除按钮必须可见')

console.log('UI refresh checks passed')
