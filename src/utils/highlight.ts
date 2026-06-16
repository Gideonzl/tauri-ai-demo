/**
 * Syntax highlighting utility — colorizes file content based on extension.
 *
 * Uses CSS custom properties (var(--syntax-xxx, fallback)) in generated HTML,
 * so colors auto-update on theme change — no Vue reactivity or cache busting needed.
 */

const FALLBACK: Record<string, string> = {
  keyword: '#c792ea',  string: '#c3e88d',  number: '#f78c6c',
  comment: '#546e7a',  key: '#89ddff',     section: '#ffcb6b',
  error: '#ff5370',    warning: '#ffcb6b', info: '#82aaff',
  variable: '#f07178', tag: '#f07178',     attr: '#c792ea',
  value: '#c3e88d',    plain: '#eeffff',
}

const VAR_MAP: Record<string, string> = {
  keyword: '--syntax-keyword',   string: '--syntax-string',
  number: '--syntax-number',     comment: '--syntax-comment',
  key: '--syntax-key',           section: '--syntax-section',
  error: '--syntax-error',       warning: '--syntax-warning',
  info: '--syntax-info',         variable: '--syntax-variable',
  tag: '--syntax-variable',      attr: '--syntax-keyword',
  value: '--syntax-string',      plain: '',
}

/** Wrap text in a span with a CSS custom property color reference */
function s(text: string, token: string): string {
  const v = VAR_MAP[token]
  const fb = FALLBACK[token] || '#fff'
  if (!v) return `<span style="color:${fb}">${text}</span>` // plain — no CSS var
  return `<span style="color:var(${v}, ${fb})">${text}</span>`
}

export function highlightCode(content: string, ext: string): string {
  if (!content) return ''
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  switch (ext) {
    case 'json': return hlJson(escaped)
    case 'yaml': case 'yml': return hlYaml(escaped)
    case 'sh': case 'bash': case 'zsh': return hlShell(escaped)
    case 'log': case 'out': return hlLog(escaped)
    case 'md': case 'markdown': return hlMd(escaped)
    case 'py': return hlPy(escaped)
    case 'js': case 'ts': case 'jsx': case 'tsx': case 'vue': return hlJs(escaped)
    case 'go': return hlGo(escaped)
    case 'rs': return hlRust(escaped)
    case 'java': case 'c': case 'cpp': case 'h': return hlC(escaped)
    case 'html': case 'xml': return hlHtml(escaped)
    case 'css': case 'scss': case 'less': return hlCss(escaped)
    case 'conf': case 'cfg': case 'ini': case 'env': case 'toml': return hlConf(escaped)
    default: return escaped
  }
}

// ======== Per-language highlighters ========

function hlJson(t: string): string {
  return t
    .replace(/(&quot;[^&]+&quot;)(\s*:)/g, (_, k, c) => s(k, 'key') + c)
    .replace(/:\s*(&quot;[^&]+&quot;)/g, (_, v) => ': ' + s(v, 'string'))
    .replace(/:\s*(\d+\.?\d*)/g, (_, n) => ': ' + s(n, 'number'))
    .replace(/:\s*(true|false|null)/g, (_, b) => ': ' + s(b, 'keyword'))
    .replace(/(\{|\}|\[|\])/g, (_, b) => s(b, 'plain'))
}

function hlYaml(t: string): string {
  return t
    .replace(/^(\s*)(#.*)$/gm, (_, sp, c) => sp + s(c, 'comment'))
    .replace(/^(\s*)([\w.-]+)(\s*:)/gm, (_, sp, k, col) => sp + s(k, 'key') + col)
    .replace(/:\s+(['"].*['"])/g, (_, v) => ': ' + s(v, 'string'))
    .replace(/:\s+(\d+)/g, (_, n) => ': ' + s(n, 'number'))
    .replace(/^(\s*[-])/gm, (_, dash) => s(dash, 'keyword'))
}

function hlShell(t: string): string {
  return t
    .replace(/(#.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/\b(echo|export|source|if|then|else|fi|for|while|do|done|case|esac|function|return|exit|set|unset|read|eval|exec|trap|wait|cd|ls|rm|mv|cp|mkdir|chmod|chown|grep|find|sed|awk|cat|tail|head|ps|kill|systemctl|docker|npm|node|python|pip|curl|wget|tar|gzip|ansible|kubectl)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\$(\w+|\{[\w}]+\})/g, (_, v) => s('$' + v, 'variable'))
    .replace(/\b(\d+)\b/g, (_, n) => s(n, 'number'))
}

function hlLog(t: string): string {
  return t
    .replace(/\b(ERROR|FATAL|CRITICAL|FAIL)\b/g, (_, e) => s(e, 'error'))
    .replace(/\b(WARN|WARNING)\b/g, (_, w) => s(w, 'warning'))
    .replace(/\b(INFO|NOTICE|OK|SUCCESS)\b/g, (_, i) => s(i, 'info'))
    .replace(/\b(DEBUG|TRACE)\b/g, (_, d) => s(d, 'comment'))
    .replace(/\b(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})\b/g, (_, dt) => s(dt, 'number'))
    .replace(/\[([^\]]+)\]/g, (_, m) => '[' + s(m, 'key') + ']')
}

function hlMd(t: string): string {
  return t
    .replace(/^(#{1,6}\s+.*)$/gm, (_, h) => s(h, 'section'))
    .replace(/(`[^`]+`)/g, (_, c) => s(c, 'string'))
    .replace(/^(\s*[-*+]\s+)/gm, (_, b) => s(b, 'keyword'))
    .replace(/^(\s*\d+\.\s+)/gm, (_, n) => s(n, 'number'))
    .replace(/\*\*([^*]+)\*\*/g, (_, b) => '<b>' + s(b, 'key') + '</b>')
    .replace(/\*([^*]+)\*/g, (_, i) => '<i>' + s(i, 'info') + '</i>')
}

function hlPy(t: string): string {
  return t
    .replace(/(#.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/('''[^']*'''|"""[^"]*""")/g, (_, q) => s(q, 'string'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/\b(def|class|import|from|as|return|if|elif|else|for|while|break|continue|try|except|finally|with|pass|raise|and|or|not|in|is|lambda|yield|async|await|self|True|False|None)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => s(n, 'number'))
}

function hlJs(t: string): string {
  return t
    .replace(/(\/\/.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/(['"`][^'"`]*['"`])/g, (_, q) => s(q, 'string'))
    .replace(/\b(function|const|let|var|import|export|from|return|if|else|for|while|do|break|continue|new|this|async|await|try|catch|throw|class|extends|switch|case|default|typeof|instanceof|true|false|null|undefined)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => s(n, 'number'))
    .replace(/(\/[^*][^/]*\/)/g, (_, rx) => s(rx, 'string'))
}

function hlGo(t: string): string {
  return t
    .replace(/(\/\/.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/\b(func|package|import|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|var|const|true|false|nil)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => s(n, 'number'))
}

function hlRust(t: string): string {
  return t
    .replace(/(\/\/.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/\b(fn|let|mut|const|static|pub|use|mod|struct|enum|impl|trait|return|if|else|for|while|loop|match|break|continue|unsafe|async|await|move|ref|self|super|crate|where|type|true|false|Some|None|Ok|Err)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => s(n, 'number'))
}

function hlC(t: string): string {
  return t
    .replace(/(\/\/.*)$/gm, (_, c) => s(c, 'comment'))
    .replace(/\/\*[\s\S]*?\*\//g, (_, c) => s(c, 'comment'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/\b(#include|#define|#ifdef|#ifndef|#endif|int|char|float|double|void|long|short|unsigned|signed|struct|union|enum|typedef|const|static|extern|volatile|if|else|for|while|do|switch|case|default|break|continue|return|sizeof|true|false|NULL)\b/g, (_, kw) => s(kw, 'keyword'))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => s(n, 'number'))
}

function hlHtml(t: string): string {
  return t
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, (_, c) => s(c, 'comment'))
    .replace(/(&lt;\/?[\w-]+)/g, (_, tg) => s(tg, 'tag'))
    .replace(/\b(\w[\w-]*)(=)("(?:[^"&]|&(?:quot|amp|lt|gt);)*")/g, (_, attr, eq, val) => ' ' + s(attr, 'attr') + eq + s(val, 'string'))
    .replace(/(&lt;[^>]+&gt;)/g, (_, tag) => s(tag, 'tag'))
}

function hlCss(t: string): string {
  return t
    .replace(/(\/\*[\s\S]*?\*\/)/g, (_, c) => s(c, 'comment'))
    .replace(/(['"][^'"]*['"])/g, (_, q) => s(q, 'string'))
    .replace(/^([\w-]+)\s*[:{]/gm, (_, prop) => s(prop, 'key') + ' {')
    .replace(/\b(\.[\w-]+)\b/g, (_, cls) => s(cls, 'section'))
    .replace(/\b(#[\w-]+)\b/g, (_, id) => s(id, 'info'))
    .replace(/\b(\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?)\b/g, (_, n) => s(n, 'number'))
    .replace(/\b(red|blue|green|white|black|gray|#[\da-fA-F]{3,8})\b/g, (_, c) => s(c, 'string'))
}

function hlConf(t: string): string {
  return t
    .replace(/^(\s*)(#.*)$/gm, (_, sp, c) => sp + s(c, 'comment'))
    .replace(/^(\s*\[[^\]]+\])/gm, (_, sec) => s(sec, 'section'))
    .replace(/^(\s*[\w.-]+)(\s*[=:])/gm, (_, k, sep) => s(k, 'key') + sep)
    .replace(/[=:]\s*(['"][^'"]*['"])/g, (_, v) => ': ' + s(v, 'string'))
    .replace(/[=:]\s*(\d+)/g, (_, n) => ': ' + s(n, 'number'))
}
