/**
 * Global context-menu coordinator — ensures only ONE menu is visible at a time.
 *
 * Uses a document-level "contextmenu" listener in CAPTURE phase.
 * The capture phase fires BEFORE any element's own @contextmenu handler.
 * So the sequence on every right-click is:
 *   1. Capture: close ALL registered menus
 *   2. Bubble:  the target element's handler opens its specific menu
 *
 * Result: at most one menu visible at any time, guaranteed.
 */
const hideFns = new Set<() => void>()

/** Installed once from main.ts */
export function initContextMenuCoordinator() {
  document.addEventListener(
    'contextmenu',
    () => hideFns.forEach(fn => fn()),
    true // capture phase — fires BEFORE element handlers
  )
}

export function useContextMenu() {
  function register(hide: () => void) {
    hideFns.add(hide)
  }

  function unregister(hide: () => void) {
    hideFns.delete(hide)
  }

  return { register, unregister }
}
