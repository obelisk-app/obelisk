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

Branch: `fix/nip17-send`. Reconciled local main `ad4f6761` with remote main `af84e844` in `77417f38`, reviewed and merged PR #36 (`46e9c8ff`) in `8a4608c3`, and committed explicit DM retries and public-key name fallbacks in `ceda64bb`. User authorized pushing all changes to main.

The current batch adds per-conversation encrypted placeholders, failed-envelope attribution only after SDK seal verification, an inbox list of unidentified failures, and explicit Quantum / Secured / Legacy send choices with hover explanations. Quantum fails instead of silently downgrading; retries retain their original encryption choice. No protocol cryptography was reimplemented in Obelisk.

Verification: the canonical full suite ran once: 1220 files passed, one identity-search assertion failed because duplicate public-key subtitles were intentionally removed. That assertion is corrected and its targeted tests pass. Typecheck and lint passed before this batch. Current batch: 136 focused tests passed; the broader affected graph passed 421 files and found one outdated automatic-Quantum badge assertion, now updated and passing all 10 panel tests. Final signer/PQ/name checks passed 24 tests; structural/i18n/typography checks passed 119 tests. Typecheck and changed-file lint passed. No production build or deployment was requested.

Runtime limitation: the user confirmed messages started decrypting, but six specific envelopes still fail. Their actual cause is unconfirmed. New metadata distinguishes detected PQ envelopes from unknown outer envelopes without logging private contents. Do not claim those six messages are repaired. Browser connector cannot load its request-header policy; native Chrome inspection works. The dev server also logged `relay needs serviceUrl to be configured before AUTH can work`; its relationship to DM failures is unconfirmed.

The HTTPS development server runs from canonical main on port 3000 using webpack and canonical certificates. After fast-forwarding main, reload the page to replace the bridge singleton. Remove this worktree after its commits are integrated and pushed.
