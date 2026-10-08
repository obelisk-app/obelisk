# Page payloads and route ownership

This pass follows the UI-efficiency audit. It corrects an over-broad rule from that pass: a route does not need a separate layout merely to hold its translation scope. Single-page routes now own their scope; layouts remain where multiple pages share behavior or a bridge provider needs to persist across navigation.

## Structure and browser work

The landing route now owns its composition; the post-quantum block is a peer section component. The single-use LandingPage component and unused navigation hook are removed. Static landing sections render on the server; FAQ disclosure, video activation, navigation, consent actions and animations retain their client boundaries.

Desktop and mobile showcase routes now own their content directly and render it on the server. Features and both tours use MarketingPageHeader and MarketingCta for their repeated introductory and closing structures, built on shared Container, Card, PageSection and typography primitives. Screenshot frames also use Card. The existing shared Navbar and Footer remain. Four scope-only layouts are removed: features, desktop, mobile and media-kit. Guides/help still share scopes across multiple pages; viewers and relay-share keep persistent bridge boundaries; voice shares viewport settings while each page selects its own messages.

Six media-kit sections are server-rendered. Brand constants, banner artwork and embed generators stay outside the client import graph. Copy and download controls remain interactive. The PNG conversion library loads on the download action, with its existing error handling and busy-state cleanup.

Voice has its own lazy loading boundary, shared by the app and standalone room. The standalone room no longer imports the combined app loaders for games and direct calls. Public app links disable automatic prefetching to avoid fetching the app before explicit navigation.

## Translation payloads

Numbers below are compact UTF-8 JSON bytes for the English route additions, comparing the previous branch head with this pass. Root common messages are excluded from both sides because they are already sent once. These are dictionary bytes, not compressed network responses or total JavaScript bundles. Spanish and Portuguese were measured too and show the same reductions.

| Route | Before | After |
| --- | ---: | ---: |
| Landing | 16,971 | 1,733 |
| Features / Help | 1,733 | 1,733 |
| Desktop / Mobile | 7,047 | 1,733 |
| Guides | 2,519 | 2,519 |
| Media kit | 4,592 | 106 |
| Voice form | 91,704 | 5,641 |
| Voice room | 91,704 | 4,961 |
| Relay share | 91,704 | 5,429 |
| Note / Profile | 70,836 | 19,539 |
| Hashtag | 70,836 | 276 |
| App | 91,704 | 91,704 |

The app retains the dictionaries required by its feature surfaces. Features, help and guides were already narrowed in the preceding pass. Localized error/not-found screens use root common messages; the unlocalized root 404 renders its copy on the server without a route dictionary.

The landing page's static client import closure falls from 184 local source files / 211,942 raw source bytes to 158 / 155,522. This measures the code moved out of client reachability, not a production bundle size. Server-rendered text and translated props still contribute to HTML/RSC output.

## Initial Features caching decision

Features has no request-specific content or live data fetching. However, the shared locale root reads headers to stamp a freshly generated CSP nonce into the document. That makes the full response request-rendered; adding `revalidate = false` to Features would not make it static. Following the user's explicit choice, this pass preserves that policy and does not claim once-per-locale HTML generation. A future full-page cache requires a static-compatible security design and production verification. Guide data's existing content-version cache is separate from full-document caching.

The subsequent approved [static-public-pages change](../static-public-pages.md) supersedes this initial caching decision: public documents use build-bound script hashes while dynamic routes retain per-request nonces. Public pages now share navbar/footer and the public translation scope through `[locale]/(site)/layout.tsx`; URLs are unchanged.

## Regression coverage and review

Route-scope checks inspect client-reachable string literals and template prefixes, excluding comments, and compare them with selected message subtrees. They reject duplicate scope ownership and single-page scope-only layouts. Client-boundary guards protect the landing/media-kit server content; page tests exercise showcase content and app navigation. Existing voice, chat, translation, copy/download and lazy-loading tests cover their changed boundaries. Independent review also checked dynamic translation-key mappings in note/profile viewers and found no missing subtrees.

Production builds, browser tests and bundle measurements remain release checks under repository policy. Typechecking, lint, relevant tests, structural guards and one integrated full test run are the verification for this development batch.
