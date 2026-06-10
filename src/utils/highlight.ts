/**
 * Syntax highlighting utility — colorizes file content based on extension
 * Returns HTML string with <span> tags for different token types
 */

const COLORS: Record<string, string> = {
  keyword: '#c792ea',     // purple
  string: '#c3e88d',      // green
  number: '#f78c6c',      // orange
  comment: '#546e7a',     // gray
  key: '#89ddff',         // cyan
  value: '#c3e88d',       // green
  section: '#ffcb6b',     // yellow
  error: '#ff5370',       // red
  warning: '#ffcb6b',     // yellow
  info: '#82aaff',        // blue
  variable: '#f07178',    // pink
  tag: '#f07178',         // pink
  attr: '#c792ea',        // purple
  plain: '#eeffff',       // white
  bg: '#0d0d1a',          // dark background
}

export function highlightCode(content: string, ext: string): string {
  if (!content) return ''
  const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  switch (ext) {
    case 'json': return highlightJson(escaped)
    case 'yaml':
    case 'yml': return highlightYaml(escaped)
    case 'sh':
    case 'bash':
    case 'zsh': return highlightShell(escaped)
    case 'log':
    case 'out': return highlightLog(escaped)
    case 'md':
    case 'markdown': return highlightMarkdown(escaped)
    case 'py': return highlightPython(escaped)
    case 'js':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'vue': return highlightJavascript(escaped)
    case 'go': return highlightGo(escaped)
    case 'rs': return highlightRust(escaped)
    case 'java':
    case 'c':
    case 'cpp':
    case 'h': return highlightC(escaped)
    case 'html':
    case 'xml': return highlightHtml(escaped)
    case 'css':
    case 'scss':
    case 'less': return highlightCss(escaped)
    case 'conf':
    case 'cfg':
    case 'ini':
    case 'env':
    case 'toml': return highlightConf(escaped)
    default: return escaped
  }
}

function span(text: string, color: string): string {
  return `<span style="color:${color}">${text}</span>`
}

function highlightJson(text: string): string {
  return text
    .replace(/(&quot;[^&]+&quot;)(\s*:\s*)/g, (_, k, c) => span(k, COLORS.key) + c)
    .replace(/:\s*(&quot;[^&]+&quot;)/g, (_, v) => ': ' + span(v, COLORS.string))
    .replace(/:\s*(\d+\.?\d*)/g, (_, n) => ': ' + span(n, COLORS.number))
    .replace(/:\s*(true|false|null)/g, (_, b) => ': ' + span(b, COLORS.keyword))
    .replace(/(\{|\}|\[|\])/g, (_, b) => span(b, COLORS.plain))
}

function highlightYaml(text: string): string {
  return text
    .replace(/^(\s*)(#.*)$/gm, (_, s, c) => s + span(c, COLORS.comment))
    .replace(/^(\s*)([\w.-]+)(\s*:)/gm, (_, s, k, col) => s + span(k, COLORS.key) + col)
    .replace(/:\s+(['"].*['"])/g, (_, v) => ': ' + span(v, COLORS.string))
    .replace(/:\s+(\d+)/g, (_, n) => ': ' + span(n, COLORS.number))
    .replace(/^(\s*[-])/gm, (_, dash) => span(dash, COLORS.keyword))
}

function highlightShell(text: string): string {
  return text
    .replace(/(#.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(echo|export|source|if|then|else|fi|for|while|do|done|case|esac|function|return|exit|set|unset|read|eval|exec|trap|wait|cd|ls|rm|mv|cp|mkdir|chmod|chown|grep|find|sed|awk|cat|tail|head|ps|kill|systemctl|docker|npm|node|python|pip|curl|wget|tar|gzip|ansible|kubectl)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\$(\w+|\{[\w}]+\})/g, (_, v) => span('$' + v, COLORS.variable))
    .replace(/\b(\d+)\b/g, (_, n) => span(n, COLORS.number))
}

function highlightLog(text: string): string {
  return text
    .replace(/\b(ERROR|FATAL|CRITICAL|FAIL)\b/g, (_, e) => span(e, COLORS.error))
    .replace(/\b(WARN|WARNING)\b/g, (_, w) => span(w, COLORS.warning))
    .replace(/\b(INFO|NOTICE|OK|SUCCESS)\b/g, (_, i) => span(i, COLORS.info))
    .replace(/\b(DEBUG|TRACE)\b/g, (_, d) => span(d, COLORS.comment))
    .replace(/\b(\d{4}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})\b/g, (_, dt) => span(dt, COLORS.number))
    .replace(/\[([^\]]+)\]/g, (_, m) => '[' + span(m, COLORS.key) + ']')
}

function highlightMarkdown(text: string): string {
  return text
    .replace(/^(#{1,6}\s+.*)$/gm, (_, h) => span(h, COLORS.section))
    .replace(/(`[^`]+`)/g, (_, c) => span(c, COLORS.string))
    .replace(/^(\s*[-*+]\s+)/gm, (_, bullet) => span(bullet, COLORS.keyword))
    .replace(/^(\s*\d+\.\s+)/gm, (_, n) => span(n, COLORS.number))
    .replace(/\*\*([^*]+)\*\*/g, (_, b) => '<b>' + span(b, COLORS.key) + '</b>')
    .replace(/\*([^*]+)\*/g, (_, i) => '<i>' + span(i, COLORS.info) + '</i>')
}

function highlightPython(text: string): string {
  return text
    .replace(/(#.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/('''[^']*'''|"""[^"]*""")/g, (_, s) => span(s, COLORS.string))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(def|class|import|from|as|return|if|elif|else|for|while|break|continue|try|except|finally|with|as|pass|raise|and|or|not|in|is|lambda|yield|async|await|self|True|False|None)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => span(n, COLORS.number))
}

function highlightJavascript(text: string): string {
  return text
    .replace(/(\/\/.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/(['"`][^'"`]*['"`])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(function|const|let|var|import|export|from|return|if|else|for|while|do|break|continue|new|this|async|await|try|catch|throw|class|extends|switch|case|default|typeof|instanceof|true|false|null|undefined)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => span(n, COLORS.number))
    .replace(/(\/[^*][^/]*\/)/g, (_, rx) => span(rx, COLORS.string))
}

function highlightGo(text: string): string {
  return text
    .replace(/(\/\/.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(func|package|import|return|if|else|for|range|switch|case|default|break|continue|go|defer|select|chan|map|struct|interface|type|var|const|true|false|nil)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => span(n, COLORS.number))
}

function highlightRust(text: string): string {
  return text
    .replace(/(\/\/.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(fn|let|mut|const|static|pub|use|mod|struct|enum|impl|trait|return|if|else|for|while|loop|match|break|continue|unsafe|async|await|move|ref|self|super|crate|where|type|true|false|Some|None|Ok|Err)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => span(n, COLORS.number))
}

function highlightC(text: string): string {
  return text
    .replace(/(\/\/.*)$/gm, (_, c) => span(c, COLORS.comment))
    .replace(/\/\*[\s\S]*?\*\//g, (_, c) => span(c, COLORS.comment))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/\b(#include|#define|#ifdef|#ifndef|#endif|int|char|float|double|void|long|short|unsigned|signed|struct|union|enum|typedef|const|static|extern|volatile|if|else|for|while|do|switch|case|default|break|continue|return|sizeof|true|false|NULL)\b/g, (_, kw) => span(kw, COLORS.keyword))
    .replace(/\b(\d+\.?\d*)\b/g, (_, n) => span(n, COLORS.number))
}

function highlightHtml(text: string): string {
  return text
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, (_, c) => span(c, COLORS.comment))
    .replace(/(&lt;\/?[\w-]+)/g, (_, t) => span(t, COLORS.tag))
    .replace(/\b(\w[\w-]*)(=)("(?:[^"&]|&(?:quot|amp|lt|gt);)*")/g, (_, attr, eq, val) => span(' ' + attr, COLORS.attr) + eq + span(val, COLORS.string))
    .replace(/(&lt;[^>]+&gt;)/g, (_, tag) => span(tag, COLORS.tag))
}

function highlightCss(text: string): string {
  return text
    .replace(/(\/\*[\s\S]*?\*\/)/g, (_, c) => span(c, COLORS.comment))
    .replace(/(['"][^'"]*['"])/g, (_, s) => span(s, COLORS.string))
    .replace(/^([\w-]+)\s*[:{]/gm, (_, prop) => span(prop, COLORS.key) + ' {')
    .replace(/\b(\.[\w-]+)\b/g, (_, cls) => span(cls, COLORS.section))
    .replace(/\b(#[\w-]+)\b/g, (_, id) => span(id, COLORS.info))
    .replace(/\b(\d+\.?\d*(px|em|rem|%|vh|vw|s|ms)?)\b/g, (_, n) => span(n, COLORS.number))
    .replace(/\b(red|blue|green|white|black|gray|#[\da-fA-F]{3,8})\b/g, (_, c) => span(c, COLORS.string))
}

function highlightConf(text: string): string {
  return text
    .replace(/^(\s*)(#.*)$/gm, (_, s, c) => s + span(c, COLORS.comment))
    .replace(/^(\s*\[[^\]]+\])/gm, (_, s) => span(s, COLORS.section))
    .replace(/^(\s*[\w.-]+)(\s*[=:])/gm, (_, k, sep) => span(k, COLORS.key) + sep)
    .replace(/[=:]\s*(['"][^'"]*['"])/g, (_, v) => ': ' + span(v, COLORS.string))
    .replace(/[=:]\s*(\d+)/g, (_, n) => ': ' + span(n, COLORS.number))
}
