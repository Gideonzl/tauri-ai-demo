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

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  assert.ok(match, `Invalid hex color: ${hex}`)
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
}

function luminance(hex) {
  return hexToRgb(hex)
    .map(value => value / 255)
    .map(value => (value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4)))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrastRatio(a, b) {
  const first = luminance(a)
  const second = luminance(b)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)
  return (lighter + 0.05) / (darker + 0.05)
}

assert.ok(contrastRatio('#f4fbff', '#070912') >= 12, 'neon-ops 正文和应用背景必须保持高反差')
assert.ok(contrastRatio('#8ea8c8', '#070912') >= 5, 'neon-ops 次级文字和应用背景必须可读')
assert.ok(contrastRatio('#f4fbff', '#10172d') >= 10, 'neon-ops 正文和面板背景必须保持高反差')

assertIncludes(variables, '$neon-cyan', 'SCSS 必须提供霓虹青色令牌')
assertIncludes(variables, '$neon-violet', 'SCSS 必须提供霓虹紫色令牌')
assertIncludes(variables, '$glow-cyan', 'SCSS 必须提供灯管青色光晕')
assertIncludes(variables, '$surface-contrast', 'SCSS 必须提供高反差面板令牌')
assertIncludes(variables, '$text-shadow-strong', 'SCSS 必须提供文字阴影增强令牌')
assertIncludes(theme, "'neon-ops'", '运行时主题必须包含 neon-ops 调色板')
assertIncludes(config, "ref<ColorScheme>('neon-ops')", '默认配置主题必须切到 neon-ops')
assertIncludes(config, 'design-neon-v1', '必须有一次性迁移让旧默认用户看到新 UI')
assertIncludes(main, "applyTheme('neon-ops')", '应用启动早期主题必须默认 neon-ops')
assertIncludes(global, 'background-attachment: fixed', '全局背景必须有固定霓虹氛围层')
assertIncludes(global, 'contrast-scrim', '全局必须有背景降噪遮罩保证文字反差')
assertIncludes(global, 'readability-high', '全局必须提供高可读性文字工具类')
assertIncludes(global, '.el-button--primary', 'Element Plus 主按钮必须统一霓虹化')

assertIncludes(mainLayout, 'shell-aurora', '主布局必须有霓虹氛围光层')
assertIncludes(mainLayout, 'shell-contrast-scrim', '主布局必须有对比度遮罩，避免背景光影响文字')
assertIncludes(mainLayout, 'tb-status-strip', '顶部栏必须重排为状态胶囊布局')
assertIncludes(mainLayout, 'cmd-fab-ring', 'AI 悬浮按钮必须有灯管环形光效')

assertIncludes(sideNav, 'nav-icon-shell', '侧边栏图标必须有胶囊灯管容器')
assertIncludes(sideNav, 'rail-glow', '侧边栏必须有纵向发光轨道')

assertIncludes(opsView, 'ops-hero', '智能运维页必须有驾驶舱 Hero 区')
assertIncludes(opsView, 'ops-tab-label', '智能运维页按钮必须重排为胶囊标签')
assertIncludes(batchPanel, 'bp-runbook-chip', '批量页剧本按钮必须保留可视化胶囊')
assertIncludes(batchPanel, 'bp-runbook-delete', '自定义剧本删除按钮必须可见')

console.log('UI refresh checks passed')
