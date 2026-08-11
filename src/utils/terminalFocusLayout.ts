export interface TerminalFocusPanelLayout {
  hostListWidth: number
  hostListCollapsed: boolean
  aiPanelCollapsed: boolean
  quickCommandsCollapsed: boolean
}

export const TERMINAL_FOCUS_STORAGE_KEY = 'aiterminal-terminal-focus-layout'

export function createTerminalFocusSnapshot(layout: TerminalFocusPanelLayout): TerminalFocusPanelLayout {
  return { ...layout }
}

export function createTerminalFocusLayout(layout: TerminalFocusPanelLayout): TerminalFocusPanelLayout {
  return {
    ...layout,
    hostListWidth: 0,
    hostListCollapsed: true,
    aiPanelCollapsed: true,
    quickCommandsCollapsed: true,
  }
}

export function restoreTerminalFocusLayout(snapshot: TerminalFocusPanelLayout): TerminalFocusPanelLayout {
  return { ...snapshot }
}
