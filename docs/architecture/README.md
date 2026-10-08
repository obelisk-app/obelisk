# Architecture

This section describes current runtime ownership. Start with [AGENTS.md](../../AGENTS.md) for repository rules, then follow the references below for subsystem contracts. Historical audit measurements and abandoned designs live under [history](../history/README.md).

## Documents, scopes and providers

| Surface | Composition and boundary | Rendering and security |
|---|---|---|
| Public site | `src/app/[locale]/(site)/layout.tsx` owns Navbar, Footer, the shared background and `IntlScope scope="public"`; pages own their content | Immutable per-build HTML and script hashes; no bridge provider |
| Chat application | `/app` owns `AppProviders`; `AppGate` selects one desktop or phone shell | Dynamic document with a fresh nonce; shared session, read state, channel voice and DM call lifetimes survive shell changes |
| Notes and profiles | `/notes/[id]/page.tsx` and `/p/[id]/page.tsx` own `IntlScope scope="viewer"` and `BridgeRoute` | Dynamic documents; server relay lookups supply content and client islands provide signed-in interactions |
| Hashtags and relay shares | `/t/[tag]/page.tsx` and `/r/[code]/page.tsx` own their `hashtag` and `relayShare` scopes plus `BridgeRoute` | Dynamic documents; each page carries its own boundary instead of a forwarding layout |
| Standalone voice | Voice layout shares viewport policy; individual pages select form or room messages | Dynamic document; voice runtime remains lazy-loaded |

The locale root owns common messages and global feedback. A nested translation provider sends only additional client-required subtrees. Server components can translate full page content without putting those dictionaries in the browser. A layout is useful when several pages share ownership or a persistent provider; a separate layout solely for one page's translation scope adds no boundary.

Shared author markup lives in `src/components/social/viewer/AuthorDetails.tsx` and `AuthorDetailsSection.tsx`; `FollowButton.tsx` is its interactive control and is also used by social widgets. These are UI components, not a React context. `NoteViewerClient.tsx` stays beside the notes page because its interaction belongs to that route. Reuse shared feature content without turning a server page into a client component or adding forwarding wrappers.

See [app shell ownership](app-shells.md) for the desktop/phone boundary, shared behavior, lazy loading and viewport navigation continuity.

## Data ownership

The bridge owns identity, signing, relay-derived state and subscriptions. React consumers use its provider and public hooks; code without a render tree uses the imperative front door. RelayHub owns sockets, authentication leases, shared subscriptions and bounded caches. Groups bind to the active relay; DMs and their cursor sync can span the account's relay set.

Browser storage and immutable HTML solve different problems. Bridge caches speed up reconnects and first paint for live data. Public HTML is generated for a deployment and paired with that build's script hashes; it must not contain request-specific state. Per-account read-state stores switch before synchronization starts, and account DM lookup cleanup owns both pending lookup results and the resulting subscription.

| Reference | Use it for |
|---|---|
| [Data system](data-system.md) | Login, loading priorities, bridge caches, relay access, local-data inventory |
| [Read state](read-state.md) | Cursors, unread state, mention navigation and encrypted multi-device sync |
| [Rendering and CSP](static-public-pages.md) | Static route eligibility, dynamic nonces, build artifacts and verification |
| [Internationalization](i18n.md) | Locale URLs, message scopes, errors and SEO |
| [UI conventions](../ui/conventions.md) | Layer ownership, cohesive components and shared primitives |
