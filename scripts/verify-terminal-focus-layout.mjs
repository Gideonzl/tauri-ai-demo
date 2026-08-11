import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  const {
    createTerminalFocusSnapshot,
    createTerminalFocusLayout,
    restoreTerminalFocusLayout,
  } = await server.ssrLoadModule('/src/utils/terminalFocusLayout.ts')

  const normalLayout = {
    hostListWidth: 220,
    hostListCollapsed: false,
    aiPanelCollapsed: false,
    quickCommandsCollapsed: false,
  }
  const focusLayout = createTerminalFocusLayout(normalLayout)

  assert.deepEqual(focusLayout, {
    hostListWidth: 0,
    hostListCollapsed: true,
    aiPanelCollapsed: true,
    quickCommandsCollapsed: true,
  }, '专注模式必须收起所有非终端工作区面板')
  assert.deepEqual(
    restoreTerminalFocusLayout(createTerminalFocusSnapshot(normalLayout)),
    normalLayout,
    '退出专注模式必须恢复进入前的面板状态和宽度',
  )
  console.log('Terminal focus layout checks passed.')
} finally {
  await server.close()
}
