# AGENTS.md: Obelisk

You are building **Obelisk**, a Discord-like group chat app where identity comes from Nostr keypairs. No emails, no passwords: cryptographic identity only.

This is the single instruction file for every agent working in this repo. `CLAUDE.md` only imports it. Edit this file, not that one. Every path, symbol and number below was checked against the tree on 2026-10-05 (`main @ e25907f`); when the code moves, move the sentence in the same commit.

See [ROADMAP.md](ROADMAP.md) for the development plan.

## Read this first: where the code still breaks its own rules

The rules in this file are the intended design. The tree does not fully obey them yet. Treat the items below as aspirations under repair, not as descriptions of reality, and do not add to any of them.

- **`src/utils/nip-kinds.ts` is the intended single source of truth for event kinds.** `src/services/nostr-bridge/client.ts:407-443` still declares 21 private `KIND_*` constants (kind 9 as `KIND_GROUP_MESSAGE`, 39000-39002, 9000-9007, 9021/9022, 0, 3, 4, 5, 7, 10000, 10002, 10050, 31314) that shadow or duplicate it; `background-watch.ts` has one more, `src/services/social/kinds.ts` thirteen, `social/publish.ts` three, `social/profiles.ts`, `social/interests.ts` and `social/starter-packs.ts` a few each. Import from `@/utils/nip-kinds`; do not add another local block.
- **"Keys are never labels" is violated by five private `shortNpub` helpers** with different truncations and hex fallbacks: `src/app/app/mobile/PhoneShell.tsx:271`, `src/components/chat/ProfilePopover.tsx:59`, `src/components/chat/NostrProfile.tsx:496`, `src/components/settings/MutedAndBlocked.tsx:93`, `src/app/t/[tag]/page.tsx:172`. The intended helper is `shortNpubLabel` in `src/utils/identity/short-npub.ts`. Use it; do not write a sixth.
- **"SVG icons, not glyphs" is violated by the glyph the rule cites.** The muted-channel marker is still `🔕` in both shells, and `✕` / `×` / `★` remain in `MediaLibraryModal.tsx`, `RelayRolesAdminModal.tsx`, `MobileSigningIndicator.tsx` and the PhoneShell search clear. New chrome goes through `src/components/ui/icons.tsx`.
- **`ingestGroupMetadata` does not fan out the way older docs said.** It calls only `queueGroupMessages(groupId)`. `subscribeGroupCreator` (`client.ts:6374`) has no caller at all, yet its two containers (`creatorSubscribedGroups`, the sub list) are still declared, cleared on session change and iterated when voice trims subscriptions. Creator lookup actually happens through the relay-wide kind 9007 sub (`subscribeMyAuthoredGroups` / `ingestGroupCreator`). Delete or re-wire; do not document it as live.
- **`src/services/voice/client.ts` wraps 16 production store calls in `catch { /* test envs */ }`.** It is a test seam leaking into production; any real store error is swallowed. Do not add a seventeenth. The fix is an injected store sink, not another catch.
- **Utilities are duplicated with diverging semantics.** `shortHost` is down to one copy (`src/utils/relay-url/url-host.ts`; the last private one, in the mobile URL state, went in round 18); `normalizeRelayUrl` three times with three signatures (`nostr-bridge/relay-url.ts` is the bridge's canonical one, `social/relays.ts` the social tier's, `PhoneShell.tsx:310` a stray). `getBridgeSync` and `getBridgeImpl` (`client.ts:8534-8541`) are byte-identical.
- **`useLocalWallet` (`src/hooks/wallet/useLocalWallet.ts`) is a stub** that always returns no client (its own header says the original module was never committed), so `InvoiceCard.tsx`'s Pay does nothing. Live zap flows use `@nostr-wot/wallet` (`MessageZapModal.tsx`, `useMessageZaps.ts`).
- **A few hooks still sit outside the hooks layer.** `src/services/remote-media-gate.ts` (`useRemoteMediaGate`) waits on the bridge front-door allow-list (`tests/services/nostr-bridge/front-door.test.ts`), which names it by path. The bridge's own hooks are in `src/services/nostr-bridge/hooks/`, the Web-of-Trust Zustand store in `src/services/wot/store.ts`, and `ReadStateRoot` (`src/services/read-state/root.tsx`) is a render-nothing component in services. `tests/hooks/hooks-layer.test.ts` exempts nothing.
- **Leftovers from the removed NDK stack:** `tests/support/mocks/ndk.ts` mocks a dependency that is no longer in `package.json`. `docs/README.md` still describes `direct-messages.md` as "NIP-04 DMs"; `docs/known-bugs.md` says `subscribeAdminMember` is fired from `ingestGroupMetadata` (it is not, see Data subscriptions).

## Architecture

Obelisk is **fully Nostr-relay-only**. There is no backend, no Postgres, no Socket.io server. One Next.js route exists, `src/app/api/link-preview/route.ts`, because unfurling an OpenGraph card needs a server to make the outbound request, and routing it through our own origin keeps every URL a reader merely *views* away from a third-party OG service. It holds no state and is not on any data path. `src/services/server/` holds the other server-only helpers (request locale, relay reads for the public `/notes/<id>` and `/p/<id>` viewers, link-preview metadata). The whole app is a thin React shell over a `nostr-tools` `SimplePool` wrapped by `src/services/nostr-bridge/client.ts`. Group state, members, admins, messages, DMs, and reactions are all NIP-29 / NIP-17 / NIP-04 events delivered straight from the relay to the client.

```
Frontend          Next.js 16 + Tailwind v4 (La Crypta UI)
Auth              Nostr (NIP-07 / nsec / NIP-46 bunker)
Bridge            src/services/nostr-bridge/ : SimplePool + nostr-tools singleton
Group protocol    NIP-29 (kinds 9, 9000-9007, 39000-39002)
DMs               NIP-17 gift wraps (kind 14 -> 13 -> 1059, NIP-44) by default; NIP-04 (kind 4) per-thread opt-out. See docs/direct-messages.md
Cache             localStorage stale-while-revalidate (src/services/nostr-bridge/cache.ts)
Voice (mesh)      P2P WebRTC, Nostr-signaled (kinds 20078 / 25050) + per-pair `obelisk-control` data channel (heartbeat, fast hangup, transitive discovery). See docs/voice/
Voice (SFU)       mediasoup engine, Nostr-RPC signaling (kind 25050 envelopes): src/services/voice/sfu-client.ts (server: obelisk-app/obelisk-sfu)
DM calls          kind 25050 over `preferences.callRelays`, throwaway keys, kind 25055 control rumors: src/services/dm-call/. See docs/voice/dm-calls.md
Games             Chain Reaction, Vesta, Stacker over kind 2390, event log replayed client-side (engines in src/lib/games/, relay transport and cache in src/services/games/)
Social feeds      Ordinary Nostr (kinds 1/6/7/16/20/9802/30023/...) over user-chosen public relays: src/services/social/
Payments          Zaps and invoices through @nostr-wot/wallet (NIP-47 NWC); src/services/wallet/ holds a stub plus zap-command parsing
```

## Stack
- **Next.js 16** + TypeScript + Tailwind CSS v4 (client-rendered; the only server route is the link-preview unfurler)
- **nostr-tools**: `SimplePool`, `BunkerSigner`, `finalizeEvent`, NIP-04/NIP-44 helpers. This is the only Nostr client in the running code path.
- **@nostr-wot/\***: `data` and `ui` (WoT-aware profile/follow hooks and `formatPubkey` / `hexToNpub`, consumed by the rail / search / DM list), `dm` (NIP-17 wire format, confined to the bridge), `pq` (post-quantum DM scheme), `signers`, `wallet` (NWC). Orthogonal to the bridge: the bridge owns identity + relay subs; nostr-wot owns WoT scoring + profile cache.
- **Zustand**: client-side state under `src/store/` (`chat`, `dm`, `dm-call`, `voice`, `notifications`, `read-state`, `channel-prefs`, `games`, `hints`, `moderation`, `multi-account`, `toast`, `locale`, `messageZap`). Identity is NOT a Zustand store; it lives on the bridge.
- **Vitest** + **React Testing Library** + **jsdom** for unit and component tests; **Playwright** for the end-to-end specs in `scripts/e2e/`.
- **NDK is not a dependency.** `grep -c "ndk\|nostr-dev-kit" package.json` is 0 and nothing in `src/` imports it. Do not reach for it. The only trace is the stale mock in `tests/support/mocks/ndk.ts`.

## Project Structure
```
src/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (La Crypta theme)
│   ├── page.tsx                  # Landing page
│   ├── app/                      # /app : the chat surface
│   │   ├── page.tsx                # Mounts <AppGate />
│   │   ├── AppGate.tsx             # Viewport switch: DesktopShell or mobile/PhoneShell (`useIsMobile`)
│   │   ├── DesktopShell.tsx        # Desktop chat shell (default export named AppShell), 5664 lines
│   │   ├── mobile/                 # PhoneShell.tsx, screens/, sheets/, mobile-shell.css (the navigation rules are in src/utils/shell/mobile)
│   │   ├── LoginModal.tsx          # 3 auth methods + QR bunker flow
│   │   ├── RelayStatusBanner.tsx   # Unified connection + access banner
│   │   ├── ServerRail.tsx          # Relay-list rail
│   │   ├── DMList.tsx, DMComposer.tsx, DMOptInGate.tsx
│   │   └── SearchBar.tsx, UserPanel.tsx, GeneratedProfileEnhancements.tsx
│   ├── api/link-preview/route.ts # The one server route (OG unfurl proxy)
│   ├── guides/                   # Markdown guides + SVG diagrams (en, es, pt)
│   ├── r/[code]/                 # Per-relay branded share-link routes (+ opengraph-image)
│   ├── notes/[id]/, p/[id]/, t/[tag]/   # Public viewers: note, profile, tag
│   ├── desktop/, mobile/, features/, help/, media-kit/   # Marketing and help pages
│   ├── voice/                    # Voice channel surface
│   └── manifest.ts, robots.ts, sitemap.ts
├── components/
│   ├── Navbar.tsx, Footer.tsx, LandingPage.tsx, Showcase.tsx
│   ├── ProfileAppearanceEditor.tsx # kind:0 editor in use (`bridge.editUserMetadata`), mounted by UserPanel
│   ├── ActivityIndicator, ToastStack, ModalShell, ErrorPanel, MobileSigningIndicator
│   ├── BlossomImageInput, UserAvatar, ObeliskIcon, ShootingStars, LanguageToggle, FAQItem
│   ├── admin/                       # RelayAdminPanel, RelayRolesAdminModal
│   ├── call/                        # DmCallButtons, DmCallLayer
│   ├── chat/                        # MemberList, MessageContent, MessageZapModal, ForumView,
│   │                                 # ProfilePopover, NostrProfile, InvoiceCard, EmojiPicker,
│   │                                 # MentionAutocomplete/Navigator, LinkPreview, CodeBlock,
│   │                                 # SpoilerText, WotBadge, ChannelContextMenu, games/GameCard, ...
│   ├── guides/                      # ArticleShell, GuideCard, Callout, ...
│   ├── hints/, media/, social/      # Onboarding hints, media library, social feed UI
│   ├── settings/                    # AccountBackupExport, CallSettings, MutedAndBlocked, NotificationSettings, SocialRelaySettings, WotSettings
│   ├── ui/                          # icons.tsx, menu.tsx, ConfirmDialog, FloatingPanel
│   └── voice/                       # VoiceRoom, VoiceStatusBar
├── hooks/                         # THE hooks layer: every React hook, by module (see "Where new code goes")
│   ├── useDismiss, useAnchoredPosition, usePreferences, useKeyedValue, useAutoMarkRead, useFaviconBadge, ...
│   ├── app/                       # The /app shells' hooks, mirroring src/app/app (mobile/, shell/, panes/, ...)
│   ├── chat/                      # Chat hooks, mirroring src/components/chat (composer/, gallery/, games/, ...)
│   ├── relay/                     # Operator data per relay: useChannelLayout, useRelayBranding, useRelayRoles, ...
│   ├── social/                    # useFeed, useAuthor, useSocialProfile, useNotePreview, useInterests, ...
│   └── read-state/, notifications/, wot/, pq/, dm/, voice/, media/, admin/, settings/, marketing/, media-kit/, wallet/
├── i18n/                          # context, rich(), useFormat, locales/{en,es,pt}.json, hardcoded-strings ratchet
├── lib/                           # Mini-packages: no app imports, publishable as they stand
│   ├── relay-hub/                 # Relay socket hub; imports only nostr-tools (pinned by isolation.test.ts)
│   ├── games/                     # Engines, protocol codec, session replay, registry (each engine loads on demand; names in game-meta.ts), clock, stacker/, vesta/
│   ├── emoji/                     # Bilingual emoji dataset + keyword search
│   ├── crypto/file-cipher.ts      # AES-256-GCM for encrypted DM uploads
│   ├── nip-59.ts                  # Gift wrap helpers
│   └── remark-spoiler.ts          # remark plugin for ||spoilers||
├── utils/                         # Small stateless helpers that belong to no feature
│   ├── nip-kinds.ts               # Intended single source of truth for kinds (see Read this first)
│   ├── nostr-signing-kinds.ts     # The kinds a signer may be asked to sign
│   ├── identity/                  # short-npub (`shortNpubLabel`, the sanctioned key -> label helper), display-name
│   ├── relay-url/                 # url-host (`shortHost`), relay-url-input, relay-share-link (/r/<code>)
│   ├── message-text/              # mentions, mentions-draft, markdown, emoji-shortcodes
│   ├── media-tags/                # custom-emoji, sticker, voice-note and media-pack tag codecs, media-kind
│   ├── attachments/               # attachments, attachments-limits, dm-file (kind 15 tag codec)
│   ├── format/                    # format (Intl dates/numbers), day-label, relative-time, format-bytes, format-elapsed, format-count
│   ├── guides/, hints/            # guide-urls, help-topics, clip-paths, asset-meta; onboarding hint registry
│   ├── scroll/, storage/          # channel scroll anchor/position, scroll-behavior, message-flash; local-store, json-safe
│   ├── shell/                     # Shell state with no React: feed-pane, view, desktop-layout; mobile/ (url-state, swipe-nav, carousel-slots, labels)
│   ├── chat/                      # Pure chat helpers: forum/, dm/, picker/, slash/, channel-timeline, channel-list-state, channel-menu-options
│   ├── media-library/             # pack-utils, gif and sticker selection, the library's types
│   ├── social/, voice/, games/    # article-meta, note-card; stage-layout; shots/ (the /dev/game-shots fixtures)
│   ├── media-kit/content.ts       # The media kit page's copy, colours, links and assets
│   ├── url/, style/, layout/, nip46/   # isHttpUrl; cn; popover-position; signer-link
│   └── csp, i18n, bolt11, search-query, link-preview, profile-links, forum-tag-colors, open-settings,
│                                   # favicon-badge, message-input-props, channel-link (channel, invite and message links)
├── services/                      # Business logic and integrations: relays, bridge, stores, fetch, storage
│   ├── nostr-bridge/              # THE bridge. Read this first.
│   │   ├── client.ts                # SimplePool wrapper, sessions, subscriptions (8541 lines)
│   │   ├── stores.ts                # React hooks: useIsLoggedIn, useGroups, useAdmins, ... (39 hooks)
│   │   ├── actions.ts               # Imperative login / publish actions (`nostrActions`)
│   │   ├── cache.ts, cache-clear.ts # Stale-while-revalidate localStorage cache + "Clear cache" sweep
│   │   ├── background-watch.ts      # MRU-relay mention watch on its own pool
│   │   ├── relay-url.ts             # normalizeRelayUrl + validation (the canonical one)
│   │   ├── signer-queue.ts, wrap-ledger.ts, decrypt-cache.ts, quota-resubscribe.ts, relay-debug.ts
│   │   ├── types.ts                 # NostrBridge interface, JsGroup/JsMessage/...
│   │   ├── provider.tsx             # <BridgeProvider> (mounted by src/app/app/layout.tsx), useBridge/useBridgeReady in hooks/provider.ts
│   │   ├── bridge-slot.ts           # The page bridge's globalThis slot: registerBridge / unregisterBridge
│   │   └── index.ts                 # Public re-exports
│   ├── channel-layout.ts          # NIP-78 (kind 30078) channel layout + operator authors
│   ├── relay-branding.ts, relay-emojis.ts, relay-roles.ts (+ -model, -sync)   # Operator-controlled kind 30078 data
│   ├── relay-info.ts              # NIP-11 fetcher + `operatorPubkeyFromRelayInfo`
│   ├── preferences.ts (+ -schema, -appearance)   # Persisted app settings (the hook is `usePreferences` in src/hooks)
│   ├── blossom, dm-attachments, dm-file-decrypt  # Encrypted DM uploads (kind 15)
│   ├── reset.ts                   # `resetAllClientState()`: login/logout teardown
│   ├── account-backup, activity-log, bot-commands, forum-prefs, group-search, guides, nip05-verify
│   ├── personal-stickers, quota-safe-storage, read-gates, recent-emojis, recent-media, recent-slash-commands, remote-media(-gate)
│   ├── clipboard, confirm-dialog, giphy, remove-relay   # copyText/copyWithToast; the confirm request store (the host is ui/ConfirmDialog); GIPHY API
│   ├── login/login-bridge.ts      # Hands the SDK's login result to the bridge; publishes a generated key's kind 0
│   ├── dm/opt-in.ts               # The `directMessagesEnabled` gate (the only file under dm/)
│   ├── dm-call/                   # DM call protocol, session (fetched on demand by load-session.ts), signaling
│   ├── wallet/                    # parse-zap-command, send-zap, zap-constants
│   ├── voice/                     # Mesh + SFU client (`client.ts`, `peer.ts`, `sfu-client.ts`, `sfu-rpc.ts`, ...)
│   ├── social/                    # Feeds, profiles, publish, relays, note-preview, interests-store, profile-feed, ...
│   ├── games/                     # Relay side of games: transport, ingest, cache, resolve
│   ├── pq/                        # Post-quantum DM attestations, capability, status, send plan
│   ├── wot/                       # Web-of-trust engine + colors
│   ├── read-state/                # Read-state root, selectors, relay-sync (NIP-59 gift wrap)
│   ├── notifications/             # classify, sound, alert, permission-prompt
│   └── server/                    # Server-only: locale, nostr-fetch, note-preview, link-preview/ (the unfurl's safe fetch, cache, rate limit)
├── store/                         # Zustand stores (see Stack)
├── types/nostr.d.ts               # `Window.nostr` typing
└── test/                          # setup.ts, fixtures/, mocks/ (webrtc, stale ndk)
```

Where new code goes: a self-contained building block with no app imports, formal enough to publish, goes in `lib/`; a small stateless helper that belongs to no feature goes in `utils/` (in a topic subfolder when it has siblings); anything that talks to a relay, the bridge, a store, `fetch`, `localStorage` on behalf of a feature, WebRTC or the filesystem goes in `services/`. React hooks go in the hooks layer, `src/hooks/<module>/`, never in a component file or folder and never in `services/`: a hook file under `src/hooks/` mirrors the module it serves (`src/components/chat/gallery/` -> `src/hooks/chat/gallery/`, `src/app/app/mobile/` -> `src/hooks/app/mobile/`, `src/services/social/` -> `src/hooks/social/`), and the store, cache or fetch it reads stays in `services/`. Before writing one, look for an existing hook that does the job (`useDismiss` for click-outside and Escape, `useAnchoredPosition` for popovers). `tests/hooks/hooks-layer.test.ts` fails on a hook file or hook definition under `src/components/` or `src/app/`, and `tests/components/components-only.test.ts` fails on any other non-component module there (a `.ts` file, or a `.tsx` file that neither renders JSX nor exports a component) outside Next.js file conventions and its short, reasoned, shrink-only list (the ui kit's `input-surface.ts` and `merge-refs.ts`, and the game helpers under `chat/games/` until that folder's own move). A props type used only by its component stays in that component file; a type shared with logic lives beside the logic.

The `prisma/` and `server.ts` of the legacy stack are gone, and `src/app/api/` holds only the link-preview route. References to `useAuthStore`, `restoreSession`, `syncProfile`, `/api/auth/*`, `/api/members/*`, `getNDK`, `src/lib/nostr.ts`, `src/hooks/useIdentity.ts` are no longer in the tree: if you find one, it slipped through and should be removed.

The chat shell entry point is `AppGate.tsx` (mounted by `app/page.tsx`); it picks between `DesktopShell` and `mobile/PhoneShell` based on `useIsMobile()`. Both shells observe `useIsLoggedIn()` and render the same store-fed UI.

## Commands
```bash
npm install            # Install dependencies
npm run dev            # Dev server at localhost:3000 (scripts/dev.mjs wraps next dev)
npm run build          # next build --webpack
npm run lint           # eslint
npm run test           # vitest run (all unit tests once)
npm run test:watch     # vitest in watch mode
npm run test:coverage  # vitest with coverage
npm run test:e2e       # Playwright specs in scripts/e2e/ (test:e2e:voice for the voice set; *:headed variants)
npm run deploy         # scripts/deploy.sh: production build + `pm2 restart obelisk-dex`
```

## Deployment discipline

- Production runs from `/root/obelisk-dex`; never build or restart it when deploying test. `scripts/deploy.sh` (`npm run deploy`) is production-only; there is no test-deploy script in the repo, so test deploys are done by hand following the rules below.
- Test runs from the single persistent `/root/obelisk-dex-test` directory on port 3002. Reuse it in place.
- **Never create timestamped, versioned, or disposable `/root/obelisk-dex-test-release-*` directories.**
- Preserve the test directory's `.env*` files and `node_modules` symlink when updating it, then build there and restart the same `obelisk-dex-test` PM2 process.
- Use a temporary directory under `/tmp` if staging is unavoidable, and remove it before finishing.
- Do not deploy production unless the user explicitly asks.

## Auth (3 methods, all relay-only)

See [docs/data-system.md](docs/data-system.md) for the complete contract.

| Method | Signer | Login entry |
|---|---|---|
| **NIP-07 extension** | `window.nostr` | `bridge.loginWithNip07(pubkeyHex)` |
| **nsec** | `finalizeEvent(template, sk)` | `bridge.loginWithNsec(privKeyHex, pubKeyHex)` |
| **NIP-46 bunker** | `BunkerSigner` (nostr-tools/nip46) | `bridge.loginWithBunker(bunkerUrl)` or `bridge.createNostrConnectSession()` (QR) |

All four entrypoints route through the private `finalizeLogin()`. The page-reload rehydration in `initialize()` (`client.ts:1816-1878`) does **not**: it repeats the steps inline, so anything added to `finalizeLogin` must be mirrored there (or hung off the `isLoggedIn` store, as the background relay watch is):

```
1. seal() + persist()              : seal the secrets (session vault), write the session record
2. resetPoolForSessionChange()     : fresh sockets so NIP-42 AUTH renegotiates
3. await connect()                 : relay handshake + open global subscriptions
4. isLoggedIn.set(true)            : flip the gate AppShell observes
```

`isLoggedIn` is the contract for "AppShell can mount the chat UI": it implies relay handshake completed and global REQs are open.

No secret is stored in the clear: the nsec, the bunker URL and the bunker client key are sealed by `src/lib/crypto/session-vault.ts` (AES-GCM, non-extractable key in IndexedDB) before `obelisk-dex/session` is written, and the SDK login widget runs on memory-only storage. See [docs/data-system.md §2](docs/data-system.md).

## Data subscriptions

`connect()` (`client.ts:2724`) opens the global REQs in two tiers. There is no separate orchestrator module (one existed until 2026-07-20); the tiering is inline, and [docs/data-system.md §4](docs/data-system.md) is its spec:

- **P0** (same microtask): whitelist preflight (`preflightRelayAccess`: kind 0 `authors:[me]` limit 1, which also ingests our own profile), then group metadata (kind 39000).
- **P2** (`queueMicrotask`): relay-wide admin/member (kinds 39001+39002, no `#d`), own contact list (kind 3), media library events, mute list (kind 10000), authored groups (kind 9007), active calls (kind 31314), live pings (relay-wide kind 9 from now), and incoming DMs (kind 4 with `#p` and `authors`, plus kind 1059 gift wraps `#p:[me]`), the last only once DMs are opted in.

`ingestGroupMetadata` does one piece of per-group work for every discovered channel:

```
ingestGroupMetadata(ev)
├── this.groups.update(...)            (plus childrenByParent via the groupParentMap reverse index)
└── queueGroupMessages(groupId)        : kind 9, #h=groupId (deferred batch drain, active channel jumps the queue)
```

Per-group admin/member (`subscribeAdminMember`) is **not** fired here; the relay-wide P2 sub covers it. The lazy per-group sub is opened from `subscribeAdmins` / `subscribeMembers` / `subscribeMembershipReady` (what `useAdmins` / `useMembers` mount) and from `getAdmins` / `getMembers`; it is idempotent and serves as a fallback. Group creators arrive through the relay-wide kind 9007 sub, not per group (`subscribeGroupCreator` is dead code, see Read this first).

Per-channel message REQs exist only for the active channel plus at most `MAX_BACKGROUND_MESSAGE_STREAMS` (8) others; `subscribeLivePings` is what lets an `@you` in any other channel still ping.

### Single-relay rule for groups; cross-relay only for DMs

**Groups bind to the active relay. Only DMs run cross-relay.** This is the
load-bearing rule that keeps the bridge from leaking pubkey via NIP-42 AUTH
challenges to relays the user isn't browsing, and keeps background work
predictable:

| Subscription                      | Scope                                      |
|----------------------------------|--------------------------------------------|
| Group metadata / messages / reactions / admin / member (kinds 9, 39000, 39001, 39002, 7, 9007) | **Active relay only** (`this.relays = [activeRelay]`) |
| Group read-state cursors (NIP-59 wraps over kind 30078) | **Active relay only**: `startGroupsRelaySync(activeRelay, ids)` in `src/services/read-state/root.tsx` |
| Mention/reply notifications (kind 9 `@you` or reply to you) | **Active relay**: per-channel ingest plus one live relay-wide `{kinds:[9], since: now}` REQ (`subscribeLivePings`; only 8 channels get their own stream, so without it most channels never ping). **Background watch** of the 3 most-recently-used other relays on a separate pool (`src/services/nostr-bridge/background-watch.ts`): `#p:[me]` catch-up from the mention cursor + live relay-wide kind 9 from now, both with `onauth` (a whitelist relay CLOSEs the first REQ `auth-required:` and nostr-tools only re-issues it when `onauth` is passed). Cards are stamped with their relay and cached per relay (`src/store/notifications.ts`) |
| DMs (kind 4 + kind 1059 gift wraps) | **NIP-65 read+write union** of the user's relay list, plus our kind-10050 inbox |
| DM read-state cursors + `inboxLastReadAt` (NIP-59 wraps) | **NIP-65 read+write union** |
| Voice signaling / SFU RPC (kinds 20078, 25050, 31313, 31314) | Per-channel relay set (mesh: the relay the call was joined on, kept while browsing elsewhere; its NIP-42 AUTH is answered only while the call's roster/signal subs are open; SFU: pinned trust set). Mesh REQs are tag-indexed (`#e` roster, `#p` signals), see [docs/voice/mesh-protocol.md](docs/voice/mesh-protocol.md) |
| DM call negotiation (kind 25050, `t: obelisk-dm-call`) | **`preferences.callRelays`** (default damus + nos.lol), the caller's list carried in the gift-wrapped invite. Separate pool, signed by per-call throwaway keys, AUTH only as that throwaway key: never the group relay, never the real key. Control messages (kind 25055 rumors) ride the DM inbox ladder. See [docs/voice/dm-calls.md](docs/voice/dm-calls.md) |
| Social feeds / profiles (kinds 1, 6, 7, 16, 20, 1111, 9735, 9802, 30023) | **`preferences.socialRelays`**: user-chosen public relays, never the group relay. See [docs/social-feeds.md](docs/social-feeds.md) |

Publishing has one extra rule that reads do not, because a publish rides an
**authenticated** socket:

| Publish | Scope |
|---|---|
| NIP-17 gift wrap, recipient copy (kind 1059) | **Recipient's kind-10050 inbox only.** Falls to their NIP-65 read set, then, last resort, the active relay. Never a union: see `resolveGiftWrapRelays` and [docs/direct-messages.md](docs/direct-messages.md). |
| NIP-17 gift wrap, self copy (kind 1059) | **Our own inbox only** (`this.relays` plus `myDmRelays`), minus any relay that just took the recipient's copy. |
| Own NIP-17 inbox list (kind 10050) | NIP-65 read+write union + active relay, with `authMode: 'never'`. |

Gift wraps publish with `authMode: 'last-resort'`: never volunteer a NIP-42
identity on the socket carrying an ephemeral-keyed envelope. A new
DM-adjacent publish must pick an `authMode` deliberately, not inherit the
default.

When you add a new background subscription, decide upfront which row it
belongs to. If it's not DMs, it goes on the active relay only, never on
`useConfiguredRelays()`. Fanning out across configured relays opens
sockets to whitelist-gated relays the user hasn't authenticated against
and produces the `Tried to send AUTH on a closed connection` loop.

The **background relay watch** is the one sanctioned exception for groups,
and it is deliberately narrow: only relays the user *used* recently (opened
or posted on; an MRU in `obelisk-dex/recent-relays/{pubkey}`), capped at
3, never the active relay, only relays still in the rail, and only kind 9
(`#p:[me]` catch-up + live-from-now; no history, metadata or members). It runs on its own `SimplePool` whose
`automaticallyAuth` answers only for its current targets, relays the user
already authenticated to, so it never reveals the pubkey anywhere new.
Toggle: `preferences.backgroundRelayWatch`. Do not grow it into a general
cross-relay sync.

**Notifications are two separate streams**, private DMs and group
pings, with independent logs and independent read cursors. A group ping
is an explicit `@you` or a reply to one of your messages (`reason:
'mention' | 'reply'`, `src/services/notifications/classify.ts`); ordinary
channel traffic never pings. Each new card chimes
(`src/services/notifications/sound.ts`: synthesized ringtones, Crystal,
Marimba, Aurora, Bubble, picked in Preferences as
`preferences.notificationRingtone`, each with distinct mention/reply/DM
phrases) and, when the
tab is backgrounded and the user opted in, raises an OS notification
(`alert.ts`); DM popups never contain plaintext. Only events under 2
minutes old alert; older backfill just gets a card. Outgoing kind 9
p-tags every `nostr:npub` it mentions (NIP-27) so the `#p` watch can see
it. A mention card is read only once its message has actually been on
screen (`useMentionSeen`, IntersectionObserver + 1s dwell) or the bell is
dismissed, never because the channel cursor moved past it. Channel
right-click / long-press (`src/components/chat/ChannelContextMenu.tsx`) sets per-channel
follow / mute / notify-level prefs (`src/store/channel-prefs.ts`), applied
only in the bridge's `deliverGroupPing`; mentions ping even on an
unfollowed channel. See
[docs/read-state.md §2b](docs/read-state.md).

## bridgeCache (stale-while-revalidate)

`src/services/nostr-bridge/cache.ts` is a small `localStorage` cache for relay-derived state. Each entry pairs an ingest writer (via `cacheSet`, often with an equality guard or a debounce) with a seed reader (`seedCacheForRelay` on bridge construction / login / `switchRelay`).

Currently wired from `client.ts`:
- kind 0 (user profiles): capped iteration on seed (500 pubkeys)
- kind 3 (own contact list), written against `PROFILE_RELAYS[0]`
- kind 7 (reactions): per-channel map, debounced 200ms, capped at `REACTION_CACHE_LIMIT` (500/channel)
- kind 9 (messages): per-channel list, debounced 200ms, capped at `MESSAGE_CACHE_LIMIT` (50/channel); optimistic placeholders are filtered out before write
- kind 9007 (creators), 39000 (group metadata, guarded by `groupEqual`), 39001/39002 (admin/member lists, guarded by `arraysEqualStrict`)
- kind 30030 (media packs), keyed `media-pack:{address}`

Wired from their own modules, same cache: kind 30078 (NIP-78) channel layout, relay branding, relay roles and relay emojis under different `d`-tags (`channel-layout.ts`, `relay-branding.ts`, `relay-roles.ts`, `relay-emojis.ts`); read-state wraps (`read-state/relay-sync.ts`); social profiles and feed cache (`social/profiles.ts`, `social/cache.ts`); kind 2390 game logs per **table**, not per channel (a `GameCard` knows only its table id, and seeds itself synchronously in a layout effect before first paint; debounced 200ms; `checkpoint` events omitted whole rather than stripped, and a table over `GAME_CACHE_EVENT_LIMIT` is skipped rather than truncated; `src/services/games/cache.ts`).

Deliberately not cached: kind 4 DMs and kind 1059 gift wraps. DM threads are in-memory and rebuild from relays on every load, so no DM plaintext is written to disk. See [docs/data-system.md §9](docs/data-system.md) for the full contract.

## Relay-wide settings authority

- The server-settings gear and relay-wide branding, layout, emoji, roles and bulk member controls are **operator-only** on desktop and mobile.
- Resolve the human operator through `operatorPubkeyFromRelayInfo()` (`src/services/relay-info.ts`): prefer a valid NIP-11 `contact` npub, then fall back to the NIP-11 `pubkey`.
- Obelisk relays advertise a service key in `pubkey` and the human operator in `contact`; never gate the human operator UI on `pubkey` alone.
- Do not broaden relay-wide authority to the union of NIP-29 group admins. A channel admin must not gain control of the entire relay. (`relayOperatorAuthors()` in `channel-layout.ts` returns exactly one author; [docs/relay-layout-and-branding.md](docs/relay-layout-and-branding.md) says the same.)
- Client-side visibility is defense in depth. The relay remains the final authorization boundary for signed NIP-29 moderation commands.

## Voice & video

Two engines, one client surface:

| Mode  | Topology      | Code path                     | When                                     |
|-------|---------------|-------------------------------|------------------------------------------|
| mesh  | P2P full mesh | `src/services/voice/peer.ts` (`Peer`) | small rooms, no SFU advertised on the channel |
| sfu   | mediasoup SFU | `src/services/voice/sfu-client.ts` (`SfuClient`); server lives in [obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu) | a kind 31313 advertisement is reachable (or pinned via `NEXT_PUBLIC_SFU_PUBKEY`) + the channel is `voice-sfu` kind |

`VoiceClient` (`src/services/voice/client.ts`, 2530 lines) owns the topology decision (`setSfuMode`) and exposes a single API to the rest of the app; UI components never see the engine. Mesh peers use perfect-negotiation over kind 25050 SDP/ICE blobs; the SFU peer uses mediasoup-client speaking RPC envelopes (`src/services/voice/sfu-rpc.ts`) on the same kind 25050.

The SFU server is a separate repo: **[obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu)** (mediasoup, Nostr-RPC signaling, allow-list, deploy). Synthetic test peers used to drive the SFU live in that repo under `scripts/test-peers/` and can be spawned manually OR via the SFU's admin UI (`/admin` -> "Spawn test peer"). They were removed from this repo on 2026-05-07.

## Vocabulary: "publications", not "forums"

Forum-kind channels are called **Publications** in every user-facing string
(a single one is "a publication"). The old "forum" / "thread" wording is
gone from the UI, SEO metadata, and all three locale files (`src/i18n/locales/{en,es,pt}.json`).

Nothing below the UI changed, and none of it should:

| Stays `forum` | Where |
|---|---|
| `["t","forum"]` channel marker | kind 9002 / 39000 tags |
| `["forum-tag", id, name, emoji?, color?]` | container metadata |
| `channelKind === 'forum'` | `JsGroup['kind']` union |
| `JsForumTag`, `JsGroup.forumTags`, `topics` | `types.ts` |
| `ForumView.tsx` and every component name | `src/` |
| `data-testid="forum-*"`, `.forum-*` CSS, `data-screen="forum"` | both shells |
| `obelisk-dex/forum-prefs/*`, `obelisk-dex/forum-collapsed/*` | localStorage |

So: renaming an identifier is a wire/compat change, renaming a string is
copy. When adding a user-visible label, say "publication". The one place
that maps kind id -> label is `CHANNEL_KIND_LABEL` in
`src/utils/shell/mobile/labels.ts`; the mobile picker used to derive its label from the kind id and therefore
printed "Forum" no matter what the strings said.

Tag colors live in `src/utils/forum-tag-colors.ts`: a curated palette, chosen
by the admin (persisted as slot 4 of `forum-tag`) or derived from a hash of
the tag id. Returns raw color strings rather than Tailwind classes, because
desktop styles with `lc-*` utilities and mobile with `--app-*` CSS
variables; inline `style` is the only thing both consume. An unrecognised
color key from a relay falls back to the derived color; never pass a
relay-supplied string into a style attribute.

## Design System (La Crypta)
- **Background:** `lc-black` (#0a0a0a) with subtle grid pattern
- **Cards:** `lc-dark` (#171717) with `lc-border` (#262626), 12px radius
- **Accent:** `lc-green` (#b4f953), lime green for active states, CTAs
- **Text:** `lc-white` (#fafafa), `lc-muted` (#a3a3a3)
- **Buttons:** Pill-shaped (9999px radius): `lc-pill-primary` / `lc-pill-secondary`
- **CSS classes:** `lc-card`, `lc-glow`, `lc-spinner`, `lc-skeleton`, `lc-img-skeleton`

### Design rules: contrast, icons, menus

- **Anything you can click must read as clickable.** Actionable text is
  `lc-white` (or `lc-green` for the primary/accent action), never
  `lc-muted`. Muted grey is for *descriptions, hints and disabled states*;
  on `lc-dark` it reads as disabled, which is how "Show tips again" ended up
  looking like a caption. A secondary or tertiary action gets a visible
  affordance too: a border (`border-lc-border`) and a faint fill
  (`bg-lc-card/60`), brightening on hover. Target WCAG AA (4.5:1 for text
  under 18px) against the surface it actually sits on (`lc-dark` panels,
  `lc-black` wells, `lc-card` tiles), and check the hover state as well as
  the resting one.
- **UI chrome uses SVG icons, not emoji or text glyphs.** Menus, buttons,
  help cards, settings nav: use `src/components/ui/icons.tsx` (24x24,
  1.8 stroke, `currentColor`) or add to it. A glyph (`⋯`, `★`, `↪`, `🔕`,
  `🗑️`) renders in whatever font the OS picks (wrong size, weight and
  baseline per platform) and emoji ignore `currentColor`, so hover,
  active and danger colours can't reach them. Emoji belong in *content*
  (messages, reactions, names), not in controls. (Known violations are listed under Read this first.)
- **One menu look.** Popover menus use `src/components/ui/menu.tsx`
  (`MENU_PANEL_CLASS`, `MenuItem`, `MenuLink`, `MenuDivider`): rounded
  panel with inner padding, icon + `lc-white` label rows, a green-tinted
  hover, red only for destructive items. Square icon buttons next to a name
  (⋯, ⚡) share `ICON_BUTTON_CLASS` so a row of them reads as one set.
- **Keys are never labels.** Show NIP-05 or a short `npub1abcd…wxyz`
  (`shortNpubLabel` in `src/utils/identity/short-npub.ts`), never raw hex, anywhere a person is identified.
  (Five private copies still exist; see Read this first.)

## Key NIPs Used

| NIP | What | Usage |
|-----|------|-------|
| NIP-01 | Basic events & profiles | Profile data (kind 0) |
| NIP-04 | Legacy direct messages | Kind 4 DMs, only for threads the user opted out of NIP-17 |
| NIP-05 | DNS-based verification | Display verification status |
| NIP-07 | Browser extension signer | Login method |
| NIP-11 | Relay information document | Operator identity (`contact` npub, then `pubkey`), relay name and icon (`src/services/relay-info.ts`) |
| NIP-17 | Private direct messages | Default DM protocol: kind 14 rumor, sealed and gift-wrapped (`sealAndGiftWrap`), routed to the recipient's kind-10050 inbox |
| NIP-27 | Text references | Outgoing kind 9 p-tags every `nostr:npub` it mentions so `#p` watches can see it |
| NIP-29 | Simple groups | Channels (kinds 9, 9000-9007, 39000-39002) |
| NIP-42 | Authentication of clients to relays | Auto-auth via `automaticallyAuth` callback |
| NIP-44 | Versioned encryption (v2) | NIP-17 seals/wraps, NIP-59 read-state sync, private kind 30015 interest entries; optional post-quantum scheme via NIP-07 (`src/services/pq/`, `@nostr-wot/pq`) |
| NIP-46 | Nostr Connect (bunker) | Remote signer login, with QR |
| NIP-47 | Nostr Wallet Connect | Zaps and invoice payment through `@nostr-wot/wallet` |
| NIP-50 | Search | `bridge.searchMessages` |
| NIP-59 | Gift wrap (kind 1059) | NIP-17 DMs; encrypted multi-device read-state sync (`src/lib/nip-59.ts`, `src/services/read-state/relay-sync.ts`) |
| NIP-65 | Relay list metadata | Auto-fetch user relays; DM-state sync targets the NIP-65 read+write union |
| NIP-78 | Application-specific data | Channel layout, branding, roles, emojis (kind 30078); also the inner rumor kind for NIP-59-wrapped read state |
| BUD-01 | Blossom upload auth | Kind 24242 (`KIND_BLOSSOM_AUTH`) signed `Authorization: Nostr ...` header in `src/services/blossom.ts`. (NIP-98 kind 27235 is declared in `nip-kinds.ts` but nothing imports it; the old `src/lib/nip98.ts` was deleted on 2026-07-20.) |

Obelisk-specific kinds (voice 20078/25050/25051/25052, DM call rumor 25055, SFU 31313/31314, games 2390)
are documented in `src/utils/nip-kinds.ts`. That file is **meant to be** the single source of
truth for every kind the app publishes; the bridge and the social module still keep private copies (see Read this first). New code imports from it and adds missing kinds there.

## Development Guidelines

### When coding:
- Identity comes from the bridge (`useIsLoggedIn`, `useMyPubkey`, `useSignerReady`, `useUserMetadata`). **Do NOT introduce a new auth store** or a backend session.
- For new relay-derived data, follow the existing pattern: add a `StateStore` on `BridgeImpl`, an ingest method that respects `created_at`-newest-wins, a `subscribeXxx` method on the bridge interface, and a `useXxx` hook in `stores.ts`.
- Use the `bridgeCache` module for any data that benefits from instant first paint on reload (small, infrequently-changing). Wire `cacheGet` for seed and `cacheSet` for write-through.
- Event kinds come from `@/utils/nip-kinds`; add the kind there if it is missing rather than declaring a local constant.
- Follow La Crypta design system: use `lc-*` CSS classes and color tokens.
- Add skeleton loading for any new data-fetching component.
- **Always write tests** for new features (see Testing).

### Bridge quick reference
```typescript
import {
  getBridge,
  useIsLoggedIn, useMyPubkey, useSignerReady,
  useGroups, useMessages, useAdmins, useMembers,
  useUserMetadata,
  nostrActions,
} from '@/services/nostr-bridge';

// In a component:
const myPubkey = useMyPubkey();
const groups = useGroups();
const admins = useAdmins(activeGroupId);

// Imperative use in a React file, inside <BridgeProvider> (the /app layout):
const live = useBridge(); // null until the bridge is ready; useBridge comes from the same front door

// Imperative publishing (non-React code keeps getBridge()):
const bridge = await getBridge();
await bridge.sendMessage(groupId, 'hello');
await bridge.editUserMetadata({ name: 'Alice', displayName: 'Alice' });
```

### LocalStorage conventions

| Data type | Key pattern | Mechanism |
|---|---|---|
| Per-user state (cursors, prefs, follows) | `obelisk-{store}:{myPubkey}` | Zustand `persist` + `ensureXxxForAccount()` helper |
| Relay-derived metadata (lists, layouts, branding) | `obelisk-cache-v3/{relay}/{kind}/{id}` | `bridgeCache` (`src/services/nostr-bridge/cache.ts`) |
| UI-only state, non-personal | `obelisk-dex/{namespace}/{id}` | direct `localStorage` |
| Per-user UI flags | `obelisk-dex/{flag}/{myPubkey}` | direct `localStorage` |

In practice the persisted store names are split between `obelisk-{name}` (`channel-prefs`, `dm-store`, `notifications`, `read-state`, `lacrypta-ranks`) and `obelisk:{name}` (`hints`, `locale`, `moderation`, `voice:quality`, `wot`); the preferences blob is `obelisk:preferences`.

When adding new persisted per-user state, follow the read-state store as the
canonical example: define a Zustand `persist` store keyed by
`obelisk-{name}` with an `ensureXxxForAccount(pubkey)` helper that swaps the
key on login. Wire the helper into the `PER_ACCOUNT_STORES` array in
`src/services/read-state/root.tsx` alongside the existing ones. See
[docs/read-state.md](docs/read-state.md) for the full pattern (cursor
model, mention/reply detection, encrypted multi-device sync via NIP-59,
deferred-mount gating), and [docs/data-system.md §9](docs/data-system.md)
for where this sits relative to the bridgeCache.

## Testing

### Stack
- **Vitest**: test runner (configured in `vitest.config.ts`)
- **React Testing Library**: component testing
- **jsdom**: browser environment simulation
- **Playwright**: end-to-end specs in `scripts/e2e/` (`npm run test:e2e`), see [docs/data-system.md §14](docs/data-system.md)

### Conventions
- Tests live in `tests/`, mirroring `src/`: `src/components/chat/Foo.tsx` is tested by `tests/components/chat/Foo.test.tsx`, which imports it as `@/components/chat/Foo`. `src/` holds no test files (`vitest.config.ts` only collects `tests/**` and `scripts/**`). Repo-wide invariant tests (`csp`, `service-worker-cache`, `hooks-after-early-return`, `no-em-dash`, `eslint-config`) sit at the top of `tests/`. The hooks-layer guard sits with the hooks it guards, `tests/hooks/hooks-layer.test.ts`, and the components-only guard with the components, `tests/components/components-only.test.ts`; a hook's test lives under `tests/hooks/` like the hook (`src/hooks/chat/gallery/useZoomPan.ts` -> `tests/hooks/chat/gallery/`).
- Two house rules are enforced, not just written down: `eslint.config.mjs` makes `max-lines` (300, blank and comment-only lines not counted) an error for `src/**`, and `tests/no-em-dash.test.ts` fails on a literal em dash (U+2014) anywhere in `src/`, `tests/`, `scripts/`, `docs/`, `content/` (the guides), `.github/`, `.claude/`, the text assets under `public/` (SVG, JSON, TXT, JS, manifest) or any file at the repo root (only the generated `package-lock.json` is left out). Neither has any exemption left. `tests/eslint-config.test.ts` also fails if a path-scoped glob in the lint config matches no file.
- Shared setup, mocks and fixtures in `tests/support/` (`setup.ts`, `warm-bridge-modules.ts`, `mocks/webrtc.ts`, `mocks/nostr-bridge.ts`, `fake-bridge.ts`, `render-with-bridge.tsx`, `fixtures/`), imported as `@tests/support/...`; `mocks/ndk.ts` is a leftover
- A new component or hook test fakes the bridge *instance*, not the module: `renderWithBridge(<X />, fakeBridge({ groups }))` (or `bridgeWrapper` for `renderHook`) runs the real hooks over seeded stores, and `fake.stores.groups.set(...)` inside `act` drives a change. `tests/bridge-mock-count.test.ts` only lets the number of `vi.mock('@/services/nostr-bridge', ...)` files go down.
- The page bridge lives on `globalThis` (`bridge-slot.ts`), so `vi.resetModules()` does not forget it: a suite that wants a fresh bridge calls `unregisterBridge()` (the bridge harnesses do), and a non-React suite can `registerBridge(fake)` instead of mocking the client module.
- Use `data-testid` attributes for reliable test selectors
- Bridge integration tests use a `FakePool` that mocks `SimplePool` (see `bridge.test.ts`, 4806 lines / 144 cases, and `login-race.test.ts`). The fake must implement `subscribe`, `publish`, `close`, AND `ensureRelay` because `connect()` awaits the handshake.

### What to test
- **Components:** rendering, skeleton states, interactions, conditional rendering
- **Stores (Zustand):** initial state, actions, persistence
- **Bridge:** subscription lifecycle, ingestion logic, cache integration, login race regressions
- **Lib functions:** pure functions, async with timeouts, error handling

### Test scope
- **Small, localized changes** (CSS, copy, one isolated component or helper): run only the directly affected test file(s), plus a targeted lint/type/build check when relevant. Do **not** run the full suite by default.
- **Broad or high-risk changes** (bridge/auth/protocol behavior, shared state, cross-cutting refactors, dependency/config upgrades): run the affected tests and the full `npm run test` suite.
- Run the full suite before a release or when the user explicitly requests it.
- If a focused test exposes wider regressions or the impact cannot be isolated confidently, expand the test scope.

> **CRITICAL, NON-NEGOTIABLE RULE:**
> A change is **NOT done** until the appropriately scoped tests are written and passing.
> Tests are part of the implementation, not an afterthought.

## Relays
- **Default for groups:** `wss://public.obelisk.ar` (constant `DEFAULT_RELAY` in `src/services/nostr-bridge/client.ts`, overridable per session). `DEFAULT_RELAYS` is that plus `wss://lacrypta-relay.obelisk.ar` (`LACRYPTA_RELAY`), which is also where the retired relay URL is redirected.
- **Profile lookup relays (bridge, kind:0 / kind:3):** `DEFAULT_PROFILE_LOOKUP_RELAYS` in
  `client.ts`: lacrypta-relay.obelisk.ar, public.obelisk.ar, purplepag.es. Deliberately
  small: these hold kind 0 for people in your NIP-29 rooms, and normal channel browsing
  must not fan out across broad public relays. (Older docs listed damus / nostr.band / nos.lol / primal here; they are not in the list.)
- **Default for social feeds:** `DEFAULT_SOCIAL_RELAYS` in `src/services/social/relays.ts`:
  damus, nos.lol, primal, snort. `relay.nostr.band` is **not** among them: it is a search
  index that does not reliably connect, and it stays available as a one-click preset and
  as a `NIP50_RELAYS` search target.
- **Social profile relays:** `preferences.socialRelays` plus the SDK's profile aggregators,
  used by `ensureSocialProfiles`. This is the tier that knows people from the wider
  network. **Anywhere a stranger's name or picture is shown (feeds, DMs, note cards),
  read `useAuthor` (`src/hooks/social/useAuthor.ts`), which merges both tiers.** Reading the bridge alone is why DM rows
  showed petnames and letter avatars while the same person resolved fine in the feed.
- **NostrConnect rendezvous:** `NOSTRCONNECT_RELAYS` in `client.ts`: relay.nsec.app, relay.damus.io, nos.lol
- **DM call relays:** `DEFAULT_CALL_RELAYS` in `src/services/preferences.ts`: relay.damus.io, nos.lol
- **User relays:** auto-fetched from NIP-65 (kind 10002) for DM delivery (`fetchMyDmRelays`), plus the kind-10050 inbox list

## Resources
- [docs/README.md](docs/README.md): index of every doc below
- [docs/data-system.md](docs/data-system.md): priority tiers (P0/P1/P2/P3), login -> connect contract, whitelist preflight (1.5s, no soak), connection banner, bridgeCache, NIP-42 AUTH, watchdog tunables, UI loading states, "Clear cache" semantics, Playwright E2E
- [docs/read-state.md](docs/read-state.md): per-channel and per-DM cursors, the two notification streams (per-relay mentions vs account-wide DMs), mention/reply detection, MentionNavigator, encrypted multi-device sync via NIP-59 gift wrap (groups state per relay; DM state on NIP-65 relays), deferred-mount gating for relay-sync subs
- [docs/direct-messages.md](docs/direct-messages.md): where the DM code actually is, NIP-17 default and NIP-04 opt-out, inbox ladder, encrypted uploads
- [docs/dm-metadata-privacy.md](docs/dm-metadata-privacy.md): why gift-wrapped DMs can still leak the social graph, the ordered relay ladder, AUTH modes, what cannot be fixed client-side, and the rules for changing DM routing
- [docs/voice/](docs/voice/README.md): mesh voice: protocol, modules, failure modes, testing (P2P WebRTC over Nostr signaling + `obelisk-control` data channel); [docs/voice/dm-calls.md](docs/voice/dm-calls.md) for DM calls
- [docs/sfu-system.md](docs/sfu-system.md): SFU architecture (mediasoup engine, Nostr-RPC signaling); [docs/sfu-known-bugs.md](docs/sfu-known-bugs.md)
- [obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu): SFU server repo (protocol spec, operator guide, deploy, synthetic test peers under `scripts/test-peers/`)
- [docs/relay-layout-and-branding.md](docs/relay-layout-and-branding.md): operator-only shared NIP-78 layout, branding, emojis, and server-settings authorization
- [docs/relay-roles.md](docs/relay-roles.md): operator-defined tiered roles (NIP-78 kind 30078); highest tier held is the badge shown in chat and the member list
- [docs/social-feeds.md](docs/social-feeds.md): the Nostr-proper surface: social as a fourth relay tier, the shared SDK pool, feed caching, `until` pagination, and the wire-format matrix (with the Amethyst/Damus/Primal quirks that make it not simply "follow the NIP")
- [docs/games.md](docs/games.md): games on the relay: kind 2390 wire format, deterministic replay as the trust model, turn clock without a server, what it doesn't defend against
- [docs/i18n.md](docs/i18n.md): the three languages: where copy lives, `rich()` for sentences with markup in them, `useFormat()`/`serverLocale()` (a bare `toLocaleDateString()` follows the OS, not the app), the hardcoded-string ratchet and what stays exempt, and how to add a fourth language
- [docs/search.md](docs/search.md), [docs/media-packs.md](docs/media-packs.md), [docs/chat-composer-attachments.md](docs/chat-composer-attachments.md), [docs/mobile-navigation.md](docs/mobile-navigation.md), [docs/onboarding.md](docs/onboarding.md), [docs/wot-and-invite-credits.md](docs/wot-and-invite-credits.md), [docs/bitcoin-zaps-nwc.md](docs/bitcoin-zaps-nwc.md)
- [docs/uploads.md](docs/uploads.md): Blossom storage + URL format
- [docs/cloudflare-tunnel.md](docs/cloudflare-tunnel.md): exposing localhost:3000 at https://obelisk.fabri.lat
- [docs/known-bugs.md](docs/known-bugs.md): open bugs & tech debt
- [Nostr Protocol](https://nostr.com)
- [NIPs Repository](https://github.com/nostr-protocol/nips)
- [La Crypta](https://lacrypta.ar)
- [ROADMAP.md](ROADMAP.md): development roadmap
