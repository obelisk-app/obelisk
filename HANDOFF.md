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


# NIP-17 investigation and main integration (2026-10-12)

Branch: `fix/nip17-send`. Reconciled local main `ad4f6761` with remote main `af84e844` in `77417f38`, then reviewed and merged PR #36 (`46e9c8ff`) in `8a4608c3`. User authorized pushing all changes to main; final integration checks and push are next.

Confirmed and fixed: switching chats requeued failed DM decryptions. Failures now require the explicit Retry action. Added privacy-safe stage/error-code diagnostics for send and local-store unlock failures. Missing profile names now show a shortened public key; removed generated fallback petnames and duplicate search subtitles. Profile-name suggestions during signup remain editable suggestions.

Verification: DM/navigation/UI focused tests passed (36), initial send-related graph passed (422 files, 2920 tests), follow-up related graph passed 433 files with one duplicate-label regression subsequently fixed and passing, PR #36 related tests passed (17 files, 140 tests), guards passed (38 files, 239 tests), typecheck and changed-file lint passed. Full-suite check on integrated canonical main remains before publication.

Still unresolved: user uses Nostr WoT extension and reports the DM key stays locked with no extension prompt after Retry. Requested the safe `[dm] unlock failed` console line; no answer yet. Do not claim this live issue or production NIP-17 sending is fixed. Browser connector cannot load its request-header policy. The dev server also receives repeated browser errors `error: relay needs serviceUrl to be configured before AUTH can work`; source and relevance to DM sending remain unverified. No production deployment authorized.

HTTPS dev server currently runs from this worktree on port 3000 using webpack and the canonical certificates. Refresh after bridge changes to replace the page singleton. Move the dev server to canonical main before removing the merged worktree.
