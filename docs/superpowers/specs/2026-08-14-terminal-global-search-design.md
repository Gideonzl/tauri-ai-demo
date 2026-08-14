# Terminal Global Search Design

## Goal

Add a minimal search experience for the output of the currently active terminal tab. It must make long command output easy to inspect without adding a permanent toolbar or interrupting SSH input.

## Scope

- Search only the current terminal's scrollback buffer.
- Each terminal tab owns its query and active match independently.
- Do not search hosts, scripts, logs, operation records, or other application data.
- Do not add dependencies.

## Interaction

- The terminal title bar includes a compact search button: a magnifier plus a `Ctrl F` hint. It opens the same search control as the keyboard shortcut; it does not create separate state.
- At narrow terminal widths the `Ctrl F` hint is hidden while the magnifier remains visible with the localized `Search terminal output` tooltip.
- The button has a restrained active treatment while the search control is open.
- `Ctrl+F` opens a compact floating search control at the upper-right of the terminal viewport; `Cmd+F` does the same on macOS.
- The control contains a query field, current/total result count, previous and next controls, and one close control.
- Search is case-insensitive partial-text matching by default. For example, `hit` matches any occurrence of `hit` in terminal output.
- Typing updates highlights and the match count immediately. The current match has a stronger theme-aware highlight than other matches.
- `Enter` or `ArrowDown` selects the next result. `Shift+Enter` or `ArrowUp` selects the previous result.
- `Escape` and the close control dismiss the control, clear search decorations, and restore focus to the terminal.
- An empty query or no result displays `0 / 0` without error feedback.

## Architecture

- `XTermFrontend` remains the sole owner of the xterm search addon. It exposes focused operations for starting, navigating, updating, and clearing a search, including result-count updates.
- `TerminalPanel` owns only the lightweight Vue floating-control state and keyboard routing. It forwards user intent to its own `XTermFrontend` instance.
- The implementation uses the already-installed `@xterm/addon-search` decorations and result-change event, avoiding copied terminal content, custom text matching, or a new persistent data store.
- Search state stays in the mounted terminal panel. It is deliberately not persisted to local data management or exported backups.

## Theme and Accessibility

- The floating control uses existing theme tokens for its surface, border, text, and focus treatment.
- Search decorations provide adequate contrast in both light and dark themes; the active match is visually distinct from passive matches.
- The query field receives focus only when search opens. Closing always returns focus to the terminal, so command input is never lost.

## Failure Handling

- If xterm cannot locate a match, the interface remains open and shows `0 / 0`.
- Search operations are safe no-ops before the terminal is mounted or after it is disposed.
- Searching cannot send input to SSH, mutate terminal output, or change session state.

## Verification

- Add automated checks for shortcut handling, default search options, navigation direction, count reset, and independent per-panel state.
- Run the relevant automated checks, production build, and a fresh startup smoke test with console warnings/errors checked.
