import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createPinia, setActivePinia } from 'pinia'

const ANSI_ESCAPE = /\u001b\[[0-9;]*m/g

const server = await createServer({
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true },
})

try {
  setActivePinia(createPinia())
  const { colorizeTerminalOutput } = await server.ssrLoadModule('/src/utils/terminalColorizer.ts')
  const curlHeaders = [
    '< access-control-allow-private-network: true',
    '< ohc-cache-hit: jnctcache61',
    '< via: CHN-HElangfang-AREACUCC2-CACHE9[84], CHN-HElangfang-AREACUCC2-CACHE36[0], TCP_HIT,10',
    '< content-range: bytes 0-100/4839594',
  ].join('\r\n')

  const colored = colorizeTerminalOutput(curlHeaders)
  const plainText = colored.replace(ANSI_ESCAPE, '')

  assert.equal(plainText, curlHeaders, '着色前后必须保留原始终端文本')
  assert.doesNotMatch(colored, /=>\s*\{/, '终端输出不得泄漏高亮回调源码')
  assert.doesNotMatch(colored, /\bfunction\s*\(/, '终端输出不得泄漏函数源码')
  console.log('Terminal colorizer runtime regression checks passed.')
} finally {
  await server.close()
}
