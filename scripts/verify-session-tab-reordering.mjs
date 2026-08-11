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
    ['third', 'first', 'second'],
    '拖到标签前方时必须重排会话数组',
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
