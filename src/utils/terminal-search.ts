import type { ISearchOptions, ISearchResultChangeEvent } from '@xterm/addon-search'

export interface TerminalSearchTheme {
  matchBackground: string
  matchBorder: string
  activeMatchBackground: string
  activeMatchBorder: string
}

export interface TerminalSearchDisplayResult {
  current: number
  total: number
}

export function createTerminalSearchOptions(theme: TerminalSearchTheme): ISearchOptions {
  return {
    caseSensitive: false,
    incremental: true,
    decorations: {
      matchBackground: theme.matchBackground,
      matchBorder: theme.matchBorder,
      matchOverviewRuler: theme.matchBorder,
      activeMatchBackground: theme.activeMatchBackground,
      activeMatchBorder: theme.activeMatchBorder,
      activeMatchColorOverviewRuler: theme.activeMatchBorder,
    },
  }
}

export function normalizeTerminalSearchResult(result: ISearchResultChangeEvent): TerminalSearchDisplayResult {
  if (result.resultIndex < 0 || result.resultCount <= 0) return { current: 0, total: 0 }
  return { current: result.resultIndex + 1, total: result.resultCount }
}
