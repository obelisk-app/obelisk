# Further code and UI audit, 2026-10-08

**Historical record.** This document preserves its original pass, plan or evidence. It is not the current implementation contract. Follow [current architecture](../../architecture/README.md) and [UI conventions](../../ui/conventions.md); source paths and measurements below describe the original work.

Base: `3e503500` on `reorg/pre-launch`. This pass revisits shared primitive contracts, remaining card/container recipes, public route ownership, and guide caching.

## Repeated layout recipes

`Container` owns centered maximum widths and optional centered text, preserving semantic elements. `PageSection` owns standard section gutters and vertical spacing, optionally composing `Reveal` on the same element. `Card` now supports the existing themed hover surface, glow and feature/hero padding; it can apply that recipe to an existing link, button or other element with `asChild`, preserving its native behavior and avoiding nested interactive elements. Modal panels opt into that shared card surface. Marketing, showcase, help, guide, media-kit and feature call sites use the primitives instead of repeating these recipes. Structural divs and unique responsive positioning remain local.

After migration, feature and route code contains 53 Card uses, 35 Container uses and 11 PageSection uses; eight modal call sites also select the shared card surface. The new layout guard rejects repeated card, standard section-spacing and centered-container recipes outside UI. Primitive tests cover semantic elements, spacing, no extra animation/card wrappers, link attributes, and dialog behavior.

## Route ownership

Guides index, guide article, help index, local-data help and media-kit now own their content in their route files. Five single-use forwarding page components were removed. Help and media-kit content use server translations, while their interactive descendants retain their client boundaries. AppGate, relay landing and voice forms remain separate because they own responsive state, navigation effects or browser interaction.

## Shared primitive fixes

Callback refs preserve React 19 cleanup callbacks across replacement, unmount and Strict Mode. Input, TextArea, Select and Checkbox merge their own hint/error description IDs with caller-supplied descriptions. Clipboard writes belong in one service; feedback and reset timers belong to the latest request and mounted hook lifetime. Missing clipboard support no longer reports successful sharing. Best-effort immediate toasts remain compatible, including synchronous browser-shim failures. Regression tests reproduced failures before these fixes.

## Guide caching

The root layout reads a per-request CSP nonce from headers, so complete HTML remains dynamic. Production guide data is now cached through Next's data cache with `revalidate: false`, keyed by locale, slug and a hash of deployed guide content. Metadata, article reads and related cards share the cache. A content change produces a new cache namespace on process startup, so deployment updates are visible. Development, tests and explicit fixture roots bypass caching.

This does not cache full HTML or MDX compilation. Indefinite data caching does not promise that a platform will never evict cache entries. Full-page static caching requires a separate change to the nonce CSP design; it was not silently weakened for this audit. See [Next.js CSP documentation](https://nextjs.org/docs/app/guides/content-security-policy).

## Verification

Independent worktree checks covered typecheck, changed-file lint, targeted behavior tests and structural guards. The integrated worktree passed typecheck, changed-file lint, source-byte checks, diff checks and all 229 structural guards. The related run passed 199 suites; two suites exposed outdated fixtures, which were corrected and passed in a focused 14-test run. The final branch suite is recorded in the completion report. Browser visual comparison, release build and end-to-end validation remain outside this audit under repository release instructions.
