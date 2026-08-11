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
    reorderSessionTabs(sessions, 'third', 'first', 'before').map((session) => session.id),
    ['third', 'first', 'second'],
    '拖到目标标签左半边时必须插入到目标前方',
  )
  assert.deepEqual(
    reorderSessionTabs(sessions, 'first', 'third', 'after').map((session) => session.id),
    ['second', 'third', 'first'],
    '拖到目标标签右半边时必须插入到目标后方',
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
