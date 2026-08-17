import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createTerminalSearchOptions,
  normalizeTerminalSearchResult,
} from '../src/utils/terminal-search.ts'

const theme = {
  matchBackground: '#554400',
  matchBorder: '#ccaa11',
  activeMatchBackground: '#ddaa22',
  activeMatchBorder: '#fff0aa',
}

assert.deepEqual(
  normalizeTerminalSearchResult({ resultIndex: -1, resultCount: 0 }),
  { current: 0, total: 0 },
  'no terminal match should display 0 / 0',
)
assert.deepEqual(
  normalizeTerminalSearchResult({ resultIndex: 2, resultCount: 8 }),
  { current: 3, total: 8 },
  'xterm zero-based match indices should become one-based for people',
)

const options = createTerminalSearchOptions(theme)
assert.equal(options.caseSensitive, false, 'terminal search should match case-insensitively')
assert.equal(options.decorations?.matchBackground, '#554400', 'passive matches should use the active theme')
assert.equal(options.decorations?.activeMatchBackground, '#ddaa22', 'active matches should use the active theme')

const root = resolve(import.meta.dirname, '..')
const panel = readFileSync(resolve(root, 'src/components/TerminalPanel.vue'), 'utf8')
assert.ok(panel.includes('class="terminal-search-trigger"'), 'terminal title bar should expose a search button')
assert.ok(panel.includes('@click="openTerminalSearch"'), 'search button should reuse the existing search action')
assert.ok(panel.includes("'is-active': terminalSearchOpen"), 'search button should reflect open search state')
assert.ok(panel.includes('<kbd>Ctrl F</kbd>'), 'search button should make the shortcut discoverable')
assert.ok(panel.includes('.terminal-search-trigger kbd'), 'narrow terminal styles should be able to hide only the shortcut hint')

console.log('Terminal global search checks passed')
