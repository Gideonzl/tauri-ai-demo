import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  const { reorderSessionTabs } = await server.ssrLoadModule('/src/utils/sessionTabOrder.ts')
  const sessions = [{ id: 'first' }, { id: 'second' }, { id: 'third' }]

  assert.deepEqual(
    reorderSessionTabs(sessions, 'third', 'first').map((session) => session.id),
    ['third', 'second', 'first'],
    '拖到另一个标签上时必须只交换两个终端窗口的位置',
  )
  assert.deepEqual(
    reorderSessionTabs(sessions, 'second', 'second').map((session) => session.id),
    ['first', 'second', 'third'],
    '拖到自身时不得改变会话顺序',
  )
  console.log('Session tab reordering checks passed.')
} finally {
  await server.close()
}
