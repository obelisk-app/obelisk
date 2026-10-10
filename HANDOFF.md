# Hook wrapper audit

Branch: `refactor/hook-wrapper-audit`. Base: `9bdc20aa` from main. Changes are isolated in this worktree and are not merged or pushed.

## Changes

Scanned 371 hook modules, including 104 modules of at most 25 lines, and traced small helper imports to their production callers. Consolidated five clear single-owner wrappers: root appearance application, color input validation, backup failure counting, notification row conditions and voice playback rate cycling. Removed the corresponding helper modules and moved behavioral coverage to their owning hooks. Shared subscriptions, substantial pure transformations and asynchronous lifecycle services retain their boundaries.

Appearance CSS now depends only on the four palette values. Bubble animation is applied separately, so unrelated preferences and animation changes no longer rebuild or rewrite the palette. Backup counting no longer allocates an intermediate filtered array. No measured bundle-size or memory reduction is claimed.

Updated AGENTS.md and UI conventions to allow trivial single-use logic in its owning hook rather than requiring unnecessary helper files.

## Verification

Typecheck and changed-file ESLint passed. Related tests: 64 files, 532 tests passed. Structural guards: 38 files, 239 tests passed. Final notification permission regression: 5 tests passed. No production build or full-suite run, following repository worktree policy.

## Remaining

Review and integrate the branch when requested. The canonical checkout and other agents' worktrees were left unchanged.
