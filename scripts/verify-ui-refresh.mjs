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
const inspectionPanel = readFileSync(resolve(root, 'src/views/ops/InspectionPanel.vue'), 'utf8')
const logPanel = readFileSync(resolve(root, 'src/views/ops/LogPanel.vue'), 'utf8')
const workspace = readFileSync(resolve(root, 'src/views/WorkspaceView.vue'), 'utf8')
const terminalPanel = readFileSync(resolve(root, 'src/components/TerminalPanel.vue'), 'utf8')
const aiChat = readFileSync(resolve(root, 'src/components/AiChat.vue'), 'utf8')
const opsPermission = readFileSync(resolve(root, 'src/components/OpsPermissionControl.vue'), 'utf8')
const opsEmptyState = readFileSync(resolve(root, 'src/components/OpsEmptyState.vue'), 'utf8')

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
assert.ok(contrastRatio('#07111f', '#22f7ff') >= 4.5, '霓虹青主色必须配深色前景以保证按钮文字可读')
assert.ok(contrastRatio('#ffffff', '#0066cc') >= 4.5, '深蓝主色必须配白色前景以保证按钮文字可读')

const themePrimaries = [...theme.matchAll(/primary:\s*'(#[a-f\d]{6})'/gi)].map(([, color]) => color)
assert.ok(themePrimaries.length >= 10, '主题定义必须包含完整的主色集合')
for (const primary of themePrimaries) {
  const bestForegroundContrast = Math.max(
    contrastRatio(primary, '#07111f'),
    contrastRatio(primary, '#ffffff'),
  )
  assert.ok(bestForegroundContrast >= 4.5, `${primary} 必须存在符合 WCAG AA 的黑/白主色前景`)
}

assertIncludes(variables, '$neon-cyan', 'SCSS 必须提供霓虹青色令牌')
assertIncludes(variables, '$neon-violet', 'SCSS 必须提供霓虹紫色令牌')
assertIncludes(variables, '$glow-cyan', 'SCSS 必须提供灯管青色光晕')
assertIncludes(variables, '$surface-contrast', 'SCSS 必须提供高反差面板令牌')
assertIncludes(variables, '$text-shadow-strong', 'SCSS 必须提供文字阴影增强令牌')
assertIncludes(variables, '$shell-topbar-bg', 'SCSS 必须提供自适应顶栏令牌')
assertIncludes(variables, '$shell-workspace-bg', 'SCSS 必须提供自适应工作区令牌')
assertIncludes(variables, '$color-on-primary', 'SCSS 必须提供主色控件的高对比文字令牌')
assertIncludes(theme, "'neon-ops'", '运行时主题必须包含 neon-ops 调色板')
assertIncludes(theme, "'--shell-topbar-bg'", '运行时主题必须生成自适应顶栏颜色')
assertIncludes(theme, "'--shell-workspace-bg'", '运行时主题必须生成自适应工作区颜色')
assertIncludes(theme, 'isLightBackground(customColors.bg)', '自定义亮色主题必须识别明暗并适配整套壳层')
assertIncludes(theme, '...buildPalette(customDef)', '自定义主题必须复用预设主题的壳层配色管线')
assertIncludes(theme, 'readableForeground(primary)', '主题必须按主色亮度自动选择按钮前景色')
assertIncludes(theme, "'--color-on-primary': primaryForeground", '主题必须输出主色控件的高对比文字令牌')
assertIncludes(config, "ref<ColorScheme>('neon-ops')", '默认配置主题必须切到 neon-ops')
assertIncludes(config, 'design-neon-v1', '必须有一次性迁移让旧默认用户看到新 UI')
assertIncludes(main, "applyTheme('neon-ops')", '应用启动早期主题必须默认 neon-ops')
assertIncludes(global, 'background-attachment: fixed', '全局背景必须有固定霓虹氛围层')
assertIncludes(global, 'contrast-scrim', '全局必须有背景降噪遮罩保证文字反差')
assertIncludes(global, 'readability-high', '全局必须提供高可读性文字工具类')
assertIncludes(global, '.el-button--primary', 'Element Plus 主按钮必须统一霓虹化')
assertIncludes(global, 'color: $color-on-primary !important', 'Element Plus 实心主按钮文字必须跟随高对比令牌')
assertIncludes(global, '.el-button--primary.is-text', '主色文字按钮必须与实心按钮分开处理，避免继承错误前景色')

assertIncludes(mainLayout, 'shell-aurora', '主布局必须有霓虹氛围光层')
assert.ok(!mainLayout.includes('shell-contrast-scrim'), '主布局不能保留覆盖内容的全屏阴影层')
assertIncludes(mainLayout, 'tb-status-strip', '顶部栏必须重排为状态胶囊布局')
assertIncludes(mainLayout, 'cmd-fab-ring', 'AI 悬浮按钮必须有灯管环形光效')
assertIncludes(mainLayout, 'ai-panel-close', '右侧 AI 面板必须提供可见的关闭按钮')
assertIncludes(mainLayout, '@pointerdown="onAiPanelResizeStart"', '右侧 AI 面板必须使用可靠的指针拖拽调整宽度')
assertIncludes(mainLayout, 'ai-resize-bar', '右侧 AI 面板必须提供可见的专用拖拽分隔条')
assertIncludes(mainLayout, 'resetAiPanelWidth', '右侧 AI 面板拖拽条必须支持双击复位')
assertIncludes(mainLayout, '$shell-topbar-bg', '主布局顶栏必须跟随主题明暗切换')
assertIncludes(mainLayout, '$shell-sidebar-bg', '主布局侧栏必须跟随主题明暗切换')
assertIncludes(mainLayout, '$shell-ai-bg', '主布局 AI 面板必须跟随主题明暗切换')
assertIncludes(mainLayout, '全局可拖拽的 AI 命令助手入口', '悬浮助手必须能移出工作区以避免遮挡内容')
assertIncludes(mainLayout, '@pointerdown="onCmdFabPointerDown"', '悬浮助手必须支持全局指针拖拽')
assertIncludes(mainLayout, 'cmdFabPosition', '悬浮助手必须保存独立的全局坐标')
assertIncludes(mainLayout, 'ai-command-fab-position', '悬浮助手必须记住用户上次位置')
assertIncludes(mainLayout, 'position: fixed', '悬浮助手必须相对窗口定位，允许拖到任意位置')

assertIncludes(sideNav, 'nav-icon-shell', '侧边栏图标必须有胶囊灯管容器')
assertIncludes(sideNav, 'rail-glow', '侧边栏必须有纵向发光轨道')
assertIncludes(sideNav, '$shell-nav-rail', '侧边栏发光轨道必须跟随主题色')

assertIncludes(workspace, '$shell-workspace-bg', '主机工作区必须和当前主题使用同一背景体系')
assertIncludes(workspace, '$surface-contrast', '主机列表和标签栏必须使用可读性面板')
assertIncludes(terminalPanel, '$surface-contrast', '终端标题栏必须使用可读性面板')

assertIncludes(opsView, 'ops-hero', '智能运维页必须有驾驶舱 Hero 区')
assertIncludes(opsView, 'ops-tab-label', '智能运维页按钮必须重排为胶囊标签')
assertIncludes(opsView, '$shell-workspace-bg', '智能运维页背景必须跟随明暗主题，不能压暗亮色工作区')
assertIncludes(opsView, 'box-shadow: none', '智能运维页必须移除覆盖式大阴影')
assertIncludes(opsView, '@media (max-width: 1280px)', '智能运维头部必须在窄空间切换为分行布局')
assertIncludes(opsView, 'ops-server-control', '智能运维服务器选择器必须能随布局缩放')
assertIncludes(batchPanel, 'bp-runbook-chip', '批量页剧本按钮必须保留可视化胶囊')
assertIncludes(batchPanel, 'bp-runbook-delete', '自定义剧本删除按钮必须可见')
assertIncludes(batchPanel, 'color: $color-on-primary', '批量页主色选项必须使用高对比文字')

assertIncludes(inspectionPanel, 'class="ip-ai-analyze"', '巡检 AI 分析操作必须有独立的可读性样式钩子')
assertIncludes(inspectionPanel, 'color: $color-on-primary !important', '巡检 AI 分析按钮必须使用高对比文字')
assertIncludes(inspectionPanel, 'background: $gradient-primary !important', '巡检 AI 分析按钮必须使用受控的主题强调背景')
assertIncludes(inspectionPanel, '&.is-disabled', '巡检 AI 分析按钮必须覆盖禁用状态的低对比文字')
assertIncludes(inspectionPanel, '&.is-loading::before { background-color: transparent !important; }', '巡检 AI 分析加载遮罩不得覆盖按钮文字')
assertIncludes(inspectionPanel, '&.is-loading > span', '巡检 AI 分析加载状态的文字必须位于遮罩之上')
assertIncludes(inspectionPanel, 'aiReportDismissed', '巡检 AI 报告必须支持关闭后收起')
assertIncludes(inspectionPanel, 'dismissAiReport', '巡检 AI 报告必须提供关闭处理')
assertIncludes(inspectionPanel, 'class="ip-ai-close"', '巡检 AI 报告必须提供可见的关闭按钮')

assertIncludes(logPanel, 'class="lp-ai-close"', '日志 AI 报告必须提供可见的关闭按钮')
assertIncludes(logPanel, 'aiReportDismissed', '日志 AI 报告必须支持关闭后收起')
assertIncludes(logPanel, 'class="lp-ai-resize"', '日志 AI 报告必须提供左右拖拽分隔条')
assertIncludes(logPanel, '@pointerdown="onAiResizeStart"', '日志 AI 报告必须使用可靠的指针拖拽调整宽度')
assertIncludes(logPanel, 'resetAiWidth', '日志 AI 报告拖拽条必须支持双击复位')
assertIncludes(logPanel, 'class="lp-ai-analyze"', '日志 AI 分析按钮必须有独立高对比样式')
assertIncludes(logPanel, '&.is-loading::before { background-color: transparent !important; }', '日志 AI 分析加载遮罩不得覆盖按钮文字')

assertIncludes(aiChat, '&.user', 'AI 对话必须提供用户消息布局')
assertIncludes(aiChat, 'max-width: 85%', '用户消息必须右侧收束，避免整栏卡片化')
assertIncludes(aiChat, 'max-width: 90%', 'AI 消息必须保留阅读留白')
assertIncludes(aiChat, 'border-left: 2px solid $color-primary', 'AI 消息必须用轻量来源标识替代厚重阴影')
assertIncludes(aiChat, 'box-shadow: none', 'AI 对话气泡必须移除厚重投影')
assertIncludes(aiChat, 'assistant-identity', 'AI 对话必须把身份与状态收束为一个轻量头部')
assertIncludes(aiChat, 'composer-shell', 'AI 对话必须使用独立的简洁编辑器容器')
assertIncludes(aiChat, 'chat-composer', 'AI 对话编辑器必须拥有专用样式钩子')
assertIncludes(aiChat, 'message-body {\n      background: transparent', 'AI 回复必须去卡片化，突出阅读内容')
assertIncludes(aiChat, 'assistant-address', 'AI 对话头部必须保留当前服务器地址信息')
assertIncludes(aiChat, 'container-type: inline-size', 'AI 对话头部必须能按右侧面板宽度自适应')
assertIncludes(aiChat, '@container (max-width: 460px)', '窄 AI 面板必须收起权限文字以避免遮挡')
assertIncludes(aiChat, 'color: $color-text-regular !important', 'AI 工具栏图标必须使用可读的主题正文色')
assertIncludes(aiChat, '.assistant-state { display: flex; align-items: center; gap: 4px; max-width: 170px; color: $color-text-regular', 'AI 小字号状态文字必须使用可读的主题正文色')
assertIncludes(sideNav, '&::before', '侧边栏选中态必须使用自适应指示条')
assertIncludes(sideNav, 'border-radius: 8px', '侧边栏选中态必须避免大圆形按钮效果')

assertIncludes(opsPermission, 'permission-dialog', '权限弹窗必须有独立主题样式钩子')
assertIncludes(opsPermission, 'ops-permission-control', '权限控制样式必须限制在自身组件范围内')
assertIncludes(opsPermission, 'permission-label', '权限按钮必须支持窄面板下的紧凑展示')
assertIncludes(opsPermission, 'color: $color-text-regular', '权限图标必须使用可读的主题正文色')
assertIncludes(opsPermission, 'background: $surface-contrast-soft', '权限选项卡背景必须跟随亮暗主题')
assertIncludes(opsPermission, 'background: $color-bg-active', '权限选中态必须跟随当前主题强调色')
assertIncludes(opsPermission, 'color: $color-text-primary', '权限选项文字必须使用主题正文色')
assertIncludes(opsEmptyState, 'ops-empty-state', '运维页面必须复用统一的空状态组件')
assertIncludes(opsEmptyState, '$color-bg-active', '运维空状态图标必须跟随当前主题')
assertIncludes(global, '.ops-toolbar', '运维页面必须提供统一工具栏样式')
assertIncludes(logPanel, 'ops-toolbar', '日志页必须接入统一工具栏')
assertIncludes(inspectionPanel, 'OpsEmptyState', '巡检页必须接入统一空状态')
assertIncludes(batchPanel, 'OpsEmptyState', '批量页必须接入统一空状态')

console.log('UI refresh checks passed')
