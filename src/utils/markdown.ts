/**
 * Markdown 渲染 + 代码高亮
 * 使用 markdown-it + highlight.js，Termius 暗色主题
 */
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/core'
// 按需加载常见语言（减小包体积）
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import shell from 'highlight.js/lib/languages/shell'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import sql from 'highlight.js/lib/languages/sql'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import nginx from 'highlight.js/lib/languages/nginx'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import makefile from 'highlight.js/lib/languages/makefile'

// 注册语言
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', shell)
hljs.registerLanguage('sh', shell)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('scss', scss)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('plaintext', plaintext)
hljs.registerLanguage('text', plaintext)
hljs.registerLanguage('nginx', nginx)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('conf', ini)
hljs.registerLanguage('makefile', makefile)

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
  highlight(code: string, lang: string): string {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    try {
      const highlighted = hljs.highlight(code, { language }).value
      return `<pre class="hljs code-block" data-lang="${language}"><code>${highlighted}</code></pre>`
    } catch {
      return `<pre class="hljs code-block" data-lang="${language}"><code>${md.utils.escapeHtml(code)}</code></pre>`
    }
  },
})

/** 渲染 Markdown 为 HTML */
export function renderMarkdown(content: string): string {
  if (!content) return ''
  return md.render(content)
}

/** 给代码块添加 Copy 按钮（在 nextTick 中调用，操作 DOM） */
export function attachCopyButtons(container: HTMLElement) {
  const blocks = container.querySelectorAll('.code-block')
  blocks.forEach((block) => {
    // 避免重复添加
    if (block.querySelector('.copy-btn')) return
    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.textContent = 'Copy'
    btn.onclick = async () => {
      const code = block.querySelector('code')?.textContent || ''
      try {
        await navigator.clipboard.writeText(code)
        btn.textContent = 'Copied!'
        setTimeout(() => (btn.textContent = 'Copy'), 2000)
      } catch {
        btn.textContent = 'Failed'
        setTimeout(() => (btn.textContent = 'Copy'), 2000)
      }
    }
    block.appendChild(btn)
  })
}
