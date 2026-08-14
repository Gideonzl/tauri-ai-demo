import assert from 'node:assert/strict'
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

console.log('Terminal global search checks passed')
