# Minimal Side Navigation Selection Design

## Goal

Keep the selected navigation icon visually balanced at every sidebar width, especially in the compact icon-only layout.

## Selected approach

Use a fixed 36 × 36 px selected icon surface rather than a row-sized highlighted block. The surface stays centered in the navigation item. A short, 2 px primary-color indicator is vertically centered on the left edge of the item.

## Behaviour

- Compact mode: the 36 px surface is centered horizontally; the label is absent, so the background never stretches asymmetrically.
- Expanded mode: the same surface remains around the icon; text changes colour but does not acquire a second large background.
- Hover remains a subtle row background and border treatment, separate from the active state.
- The active indicator has a fixed 22 px height and stays vertically centered, independent of the item height.

## Scope and verification

Only `SideNav.vue` styles change. No routes, persistence, labels, or interaction behaviour change. Verify with the UI refresh checks, a production build, and a compact-width browser smoke test.
