# AGENTS.md: Obelisk

Obelisk is a Discord-like group chat where identity is a Nostr keypair: no email, no password, no backend. Channels, members, admins, messages, reactions and DMs are NIP-29 / NIP-17 / NIP-04 events read straight from relays by the browser. Voice is WebRTC signalled over Nostr (P2P mesh, or a mediasoup SFU from [obelisk-app/obelisk-sfu](https://github.com/obelisk-app/obelisk-sfu)).

This is the one instruction file for every agent in this repo; `CLAUDE.md` only imports it. When the code moves, fix the sentence here in the same commit. Detail lives in `docs/` (index: [docs/README.md](docs/README.md)); link to it rather than copying it here. Roadmap: [ROADMAP.md](ROADMAP.md).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4 (La Crypta design system). Pages are client-rendered over the bridge; the server side is small: `src/proxy.ts` (CSP nonce, first-visit locale), server metadata and the public `/notes`, `/p` viewers (`src/services/server/`), and one API route, `src/app/api/link-preview/route.ts` (OpenGraph unfurl, so a link a reader only *views* never reaches a third-party OG service). No database, no session server.
- `nostr-tools` for events, signing and sockets. The RelayHub (`src/lib/relay-hub/`) owns the app's relay sockets; the exceptions are the NIP-46 `BunkerSigner` (its own connection to the bunker's relays) and the SFU's direct WebSocket RPC (`src/services/voice/sfu-rpc-direct.ts`).
- `@nostr-wot/*`: `data` and `ui` (WoT-aware profiles, the login widget), `dm` (NIP-17 wire format), `pq` (post-quantum DM scheme), `signers`, `wallet` (NIP-57 zap requests and receipt validation).
- Zustand stores in `src/store/`: `chat`, `dm`, `dm-call` (with `dm-call-store`, `-policy`, `-runtime`), `voice`, `notifications`, `read-state`, `channel-prefs`, `games`, `hints`, `moderation`, `multi-account`, `toast`, `messageZap`, `invoice-payments`, `nwc-wallet`. Identity is not a store: it lives on the bridge.
- Payments (zaps and paying an invoice posted in chat) go through one module, `src/services/wallet/wallet.ts`, which picks the wallet: the account's Nostr Wallet Connect (NIP-47) wallet when one is connected (Settings > Wallet; `nwc-wallet.ts`, protocol in `src/lib/nwc/`), else a WebLN extension, else none. `pay-invoice.ts` and `send-zap.ts` sit beside it and keep their double-pay guards. The NWC link is a spending credential: sealed per account under its own vault key (`nwc-storage.ts`), never in the clear, deleted on disconnect and logout; its relay traffic rides the hub as `nwc:<client pubkey>`. See [docs/bitcoin-zaps-nwc.md](docs/bitcoin-zaps-nwc.md).
- next-intl for the three languages (see i18n).
- Vitest + React Testing Library + jsdom; Playwright for the end-to-end specs in `scripts/e2e/`.
- NDK is not a dependency. Do not add it.

## Commands

```bash
npm ci                  # install (CI uses this; needs Node 22)
npm run dev             # next dev on localhost:3000 (scripts/dev.mjs)
npm run dev:raise       # dev behind a Cloudflare tunnel, for NIP-07 / phone testing (docs/cloudflare-tunnel.md)
npm run lint            # eslint (includes the 300-line rule)
npm run typecheck       # tsc --noEmit
npm test                # vitest run, everything under tests/ (and scripts/**/*.test.ts)
npx vitest run tests/path/to/file.test.ts   # one file
npm run test:e2e        # Playwright (test:e2e:voice for the voice set; *:headed variants)
npm run build           # next build --webpack
npm run seo:check       # build, start, crawl every route as search and preview bots do; fails on any SEO problem (docs/i18n.md#seo)
bash scripts/check-source-bytes.sh          # rejects raw control bytes in tracked files
npx tsx scripts/i18n/hardcoded-baseline.ts  # regenerate the hardcoded-strings baseline
```

CI (`.github/workflows/ci.yml`) runs: `npm ci`, `check-source-bytes.sh`, `lint`, `typecheck`, `test`, then `build` in a second job.

### Deployment discipline

- `npm run deploy` (`scripts/deploy.sh`) is production only: tests, build, `pm2 restart obelisk-dex` in `/root/obelisk-dex` (`ecosystem.config.js`). `npm run raise` is the production server plus tunnel. Do not deploy production unless the user explicitly asks.
- Test runs from the single persistent `/root/obelisk-dex-test` directory (port 3002, PM2 process `obelisk-dex-test`). Reuse it in place: keep its `.env*` files and `node_modules` symlink, build there, restart that process. There is no test-deploy script.
- Never create timestamped, versioned or disposable `/root/obelisk-dex-test-release-*` directories. If staging is unavoidable use a directory under `/tmp` and remove it before finishing.

## Where code goes

The owner's folder rules, enforced by the guard tests listed under Testing:

| Folder | Holds |
|---|---|
| `src/lib/` | Mini-packages: no app imports, publishable as they stand (`relay-hub/`, `nwc/`, `games/`, `emoji/`, `crypto/`, `nip-59.ts`, `remark-spoiler.ts`) |
| `src/utils/<topic>/` | Small stateless helpers by topic (`identity/`, `relay-url/`, `format/`, `message-text/`, `errors/`, `shell/`, ...) |
| `src/services/` | Business logic and integrations: anything that talks to a relay, the bridge, a store, `fetch`, storage, WebRTC or the clipboard |
| `src/hooks/<module>/` | The hooks layer: every React hook, mirroring the module it serves (`src/components/chat/gallery/` -> `src/hooks/chat/gallery/`, `src/app/[locale]/app/mobile/` -> `src/hooks/app/mobile/`) |
| `src/components/`, `src/app/` | Components only (plus Next.js file conventions). No hook definitions, no `.ts` logic modules |
| `src/store/` | Zustand stores |
| `src/i18n/` | next-intl config, message modules, the hardcoded-strings scanner |
| `tests/` | Every test, mirroring `src/` (`src/components/chat/MemberList.tsx` -> `tests/components/chat/MemberList.test.tsx`). `src/` holds no tests |

- Before writing a hook or helper, look for one (`useDismiss` for click-outside and Escape, `useAnchoredPosition` for popovers, `shortNpubLabel` for a key shown to a person).
- A props type used only by its component stays in the component file; a type shared with logic lives beside the logic.
- Files in `src/` stay at or under 300 lines (blank and comment lines not counted). Split by responsibility; do not raise the limit.
- No em dash (U+2014) in any file, code, comments or docs. Write `\u2014` when code must handle the character as data.
- Pages live under `src/app/[locale]/`. The chat surface is `src/app/[locale]/app/`: `AppGate.tsx` picks `DesktopShell.tsx` or `mobile/PhoneShell.tsx` by `useIsMobile()`; `AppProviders.tsx` mounts the bridge provider and the runtime translator.

## The relay layer

### RelayHub (`src/lib/relay-hub/`)

The single connection owner for the page. It imports only `nostr-tools` and itself (`tests/lib/relay-hub/isolation.test.ts`), so it can move into the SDK unchanged. The bridge, the social pool, the background watch and DM calls make every REQ, query and publish through `hub.subscribe` / `hub.query` / `hub.publish`. Read the file headers in `index.ts`, `hub.ts`, `auth.ts` and `registry.ts` before changing it.

- **One socket per relay per identity.** Sockets are keyed on `(relay, identity)`. The session is one identity; a DM call is another (`ephemeral:<callId>`, `authPolicy: 'never-auth'`), so a call's throwaway key never shares a socket with the user's real key. A connected NWC wallet is a third (`nwc:<client pubkey>`, `src/services/wallet/nwc-transport.ts`): its only possible AUTH signer is the NWC client key, and it takes a `'wallet'` lease only after the wallet relay answers `auth-required:`.
- **NIP-42 AUTH once per relay + pubkey.** `AuthLayer` keeps one record per `(relayUrl, pubkey)`, not per challenge, so a reconnect does not mean a new signer prompt. Where AUTH may be answered is decided by leases (`auth-policy.ts`, `auth-leases.ts`).
- **A shared request registry.** `SubscriptionRegistry` dedupes live REQs by canonical filter (refcounted, never merged), re-issues them in priority order (`voice > active > dm > background`) on the next socket generation, runs the silence watchdog, and interprets CLOSED reasons (`restricted:`, `auth-required:`, quotas).
- **Bounded caches with eviction.** Every cache is a `BoundedMap` / `BoundedSet` (`bounded-map.ts`: LRU or FIFO, entry and byte caps, TTL). `ProfileCache` is the kind 0 cache. The bridge's own stores that grow with relay traffic are capped too (`tests/services/nostr-bridge/bounded-stores.test.ts`).
- The page's hub is created by `pageRelayHub()` (`src/services/nostr-bridge/page-hub.ts`, also exported from the front door); the social pool (`src/services/social/pool.ts`) and a connected NWC wallet share it.

### The bridge (`src/services/nostr-bridge/`)

The bridge owns the session (login, signer, sealed persistence), the relay rail, group / message / member / DM state, and the subscriptions behind them. `client.ts` is the facade (`BridgeImpl`), composed from modules in `compose.ts`; its read half is `facade-reads.ts`, its commands `facade-commands.ts`. Session code is in `session/`, groups in `groups/`, DMs in `dm/`, hooks in `hooks/`.

- **Front door.** Code outside the folder imports only `@/services/nostr-bridge` (its `index.ts`), never a file inside it. `tests/services/nostr-bridge/front-door.test.ts` enforces this; its allow-list only shrinks.
- **React gets the bridge from `<BridgeProvider>`**, never from `getBridge()` / `getBridgeImpl()`. Use the hooks for state (`useGroups`, `useMyPubkey`, `useMessages`, ...), `useBridge()` for imperative calls (null until ready, so effects list it in their deps and handlers check it), `useAwaitBridge()` for a callback that may run before the bridge has started, and `nostrActions` for commands. `getBridge()` is for code with no render tree (voice, stores, relay services).
- A route whose components use the bridge mounts the provider in its own layout or page: `AppProviders` on `/app`, `src/components/BridgeRoute.tsx` on the public viewers. Never in a layout that also wraps the landing or marketing pages, which ship without the bridge. Outside a provider the hooks return their initial value forever.
- New relay-derived data: a `StateStore` on the bridge, an ingest that keeps the newest `created_at`, a `subscribeX` on the facade, and a `useX` hook (on `useSubscription`) in the matching file under `hooks/`, exported from `index.ts`. Add the store to the test fake too (`tests/services/nostr-bridge/fake-bridge-shape.test.ts` checks it).
- `bridgeCache` (`cache.ts`, keys `obelisk-cache-v4/{relay}/{kind}/{id}`) is the localStorage stale-while-revalidate cache for small relay-derived state that should paint instantly on reload. DMs and gift wraps are never cached. Contract: [docs/data-system.md](docs/data-system.md).

```ts
import { useMyPubkey, useGroups, useBridge, useAwaitBridge, nostrActions } from '@/services/nostr-bridge';

const groups = useGroups();
const live = useBridge();
useEffect(() => {
  if (!live) return;
  return live.subscribeFilterWatched(filter, onEvent);
}, [live]);
await nostrActions.sendMessage(groupId, 'hello');
```

### Single-relay rule for groups

**Groups bind to the active relay. Only DMs run cross-relay.** This keeps the user's pubkey from reaching, through NIP-42 AUTH, relays they are not browsing.

| Traffic | Relays |
|---|---|
| Group metadata, messages, reactions, admins, members (kinds 9, 7, 9007, 39000-39002), group read-state | Active relay only |
| Mention pings | Active relay (per-channel streams for the active channel plus at most 8 others, and one relay-wide live kind 9 REQ), plus the background watch below |
| DMs (kind 1059 gift wraps, kind 4) and DM read-state | The user's NIP-65 relays and kind-10050 inbox |
| Gift wrap publish | The recipient's kind-10050 inbox, else their NIP-65 read relays, else the active relay; never a union. Gift wraps publish with `authMode: 'last-resort'`. See [docs/dm-metadata-privacy.md](docs/dm-metadata-privacy.md) |
| Voice signalling (kinds 20078, 25050, 31313, 31314) | Mesh: pinned to the relay the call was joined on, while you browse elsewhere. SFU RPC: the SFU's trusted relays as well. See [docs/voice/mesh-protocol.md](docs/voice/mesh-protocol.md) |
| DM call negotiation (kind 25050) | `preferences.callRelays`, under the call's own never-auth identity on the hub. See [docs/voice/dm-calls.md](docs/voice/dm-calls.md) |
| Social feeds and profiles | `preferences.socialRelays`, never the group relay. See [docs/social-feeds.md](docs/social-feeds.md) |

A new background subscription that is not a DM goes on the active relay, never across `useConfiguredRelays()`. A new DM-adjacent publish picks its `authMode` deliberately.

The one sanctioned exception for groups is the **background relay watch** (`background-watch.ts`): the 3 most recently used other relays still in the rail, kind 9 only (`#p:[me]` catch-up and live-from-now), with an AUTH lease only while watched. Toggle: `preferences.backgroundRelayWatch`. Do not grow it into a general cross-relay sync.

Default relays: groups `wss://public.obelisk.ar` (`DEFAULT_RELAY`) and `wss://lacrypta-relay.obelisk.ar` (`relay-list.ts`); profile lookups `DEFAULT_PROFILE_LOOKUP_RELAYS` (`profile-sync-cache.ts`); social `DEFAULT_SOCIAL_RELAYS` (`src/services/social/relays.ts`); calls `DEFAULT_CALL_RELAYS` (`src/services/preferences-schema.ts`). Anywhere a stranger's name or picture is shown, read `useAuthor` (`src/hooks/social/useAuthor.ts`), which merges the bridge's profiles with the social tier's.

Notifications (DMs and group pings as two streams, mention/reply detection, read cursors, sync over NIP-59): [docs/read-state.md](docs/read-state.md).

## Auth and the session vault

Three login methods, four entry points on the bridge (`session/login.ts`, `session/bunker-login.ts`): `loginWithNip07`, `loginWithNsec`, `loginWithBunker` and `createNostrConnectSession` (QR). All end in `finalizeLogin()`:

```
1. seal() + persist()     seal the secrets in the session vault, write the session record
2. reset session state    the hub gets the session identity; subscription bookkeeping restarts
3. await connect()        relay handshake + the global REQs (session/fanout.ts: P0 now, P2 next microtask)
4. isLoggedIn.set(true)   flip the gate last, so the shell mounts onto live subscriptions
```

The page-reload path (`session/restore.ts`) repeats these steps rather than calling `finalizeLogin`, so a step added to one must be added to the other. `isLoggedIn` is the contract for "the chat UI may mount". Do not add an auth store or a backend session.

No secret is stored in the clear. `src/lib/crypto/session-vault.ts` holds one non-extractable AES-GCM key in IndexedDB (`obelisk-vault`); the nsec, bunker URL and bunker client key are sealed with it before the record is written to `obelisk-dex/session` (`session/persistence.ts`), and a pre-vault plaintext record is migrated on load. When the browser cannot keep a key the login stays in memory and `useSessionNotice` says it will not be remembered. A connected NWC wallet is sealed the same way under a second key (`wallet-key`), so the rotation every login does never touches it; with no IndexedDB it too lasts for the visit only, and Settings says so. Opened DMs are kept only as AES-256-GCM boxes in IndexedDB (`obelisk-dms`) under a per-account key the user's signer wraps, opened once per visit when a DM surface asks (`DmUnlock`); until then nothing DM-related is decrypted and the signer is not asked ([docs/direct-messages.md](docs/direct-messages.md#storage-the-encrypted-dm-store)). The SDK login widget runs on memory-only storage (`src/services/login/signer-storage.ts`). Details: [docs/data-system.md](docs/data-system.md).

## i18n

English, Spanish and Portuguese through next-intl. English is the default and unprefixed (`/app`); Spanish and Portuguese are `/es/...` and `/pt/...` (`localePrefix: 'as-needed'`, `src/i18n/routing.ts`). The first-visit guess is in `src/proxy.ts` and only runs without a `locale` cookie. Full guide: [docs/i18n.md](docs/i18n.md).

- **Messages** are `src/i18n/messages/<locale>/<module>.json`. The module is the key's first segment (`chat.composer.send` is `composer.send` in `chat.json`). English is the source of truth; key types are generated from it, so a wrong key does not compile.
- **Scopes.** Each route ships only the modules in its `<IntlScope scope="...">` (`SCOPES` in `src/i18n/modules.ts`). A client component that reads a module its route does not ship renders the raw key; `seo` is server-only.
- **In components** `useTranslations()` from next-intl, ICU arguments (never `.replace()`), `t.rich` for markup. Links and routers come from `@/i18n/navigation` (eslint rejects `next/link` and the router hooks of `next/navigation`).
- **Errors** carry a code (`CodedError`, `src/utils/errors/codes.ts`); the UI turns any thrown value into a sentence with `errorText(t, err, fallbackKey)` (`src/utils/errors/error-text.ts`), which reads `errors.codes.<code>`.
- **Outside React** use `translate(key, values)` from `src/i18n/runtime.ts`; the app shell registers its translator (`RuntimeTranslator`), and before that `translate` returns the key.
- **No hardcoded copy.** The scanner (`src/i18n/hardcoded-strings.ts`) reads JSX text (from the syntax tree, so wrapped or `<strong>`-split sentences count), reader-facing attributes, toasts, ternaries and more; its baseline `src/i18n/hardcoded-baseline.json` is empty and may only stay empty. Text that must stay literal (brand names, protocol terms) carries an `i18n-exempt: <reason>` marker on its line (for multi-line JSX text, any of its lines or the parent's opening tag).

### Vocabulary: "publications", not "forums"

Forum-kind channels are **Publications** in every user-facing string, in all three languages (`tests/i18n/locales.test.ts` fails on "forum" / "foro" / "fórum" in a message). Identifiers do not change: the `["t","forum"]` marker, `forum-tag`, `channelKind === 'forum'`, `JsForumTag`, `ForumView`, `data-testid="forum-*"`, the `obelisk-dex/forum-*` storage keys. Renaming an identifier is a wire change; renaming a string is copy. A kind id is never shown: each shell names a kind through message keys.

## Rules that are easy to break

- **Relay-wide settings are operator-only.** Resolve the operator with `operatorPubkeyFromRelayInfo()` (`src/services/relay-info.ts`: a valid NIP-11 `contact` npub, else `pubkey`). Never widen relay-wide authority to the NIP-29 group admins; `relayOperatorAuthors()` returns exactly one author. The relay stays the final authority. See [docs/relay-layout-and-branding.md](docs/relay-layout-and-branding.md).
- **Event kinds** come from `src/utils/nip-kinds.ts`. Add a missing kind there instead of a local constant or a raw number in a filter.
- **Keys are never labels.** Show NIP-05 or `shortNpubLabel` (`src/utils/identity/short-npub.ts`), never raw hex.
- **Design.** Use the `lc-*` tokens and classes (`src/app/globals.css`) and the primitives in `src/components/ui/` (`Button`, `IconButton`, `menu.tsx`, ...) rather than a raw `<button>`. Anything clickable reads as clickable (`lc-white` or `lc-green`, never `lc-muted`; aim for WCAG AA on the surface it sits on). UI chrome uses SVG icons from `src/components/ui/icons.tsx`, not emoji or text glyphs; emoji belong in content. Data-fetching components get a skeleton state.
- **Google Analytics loads only after the person allows it** (`src/services/analytics/`; the question is `AnalyticsConsentRoot` in the `[locale]` layout). Never put a third-party script or pixel in a layout or page; anything new that reports to a third party goes behind the same answer. See [docs/data-system.md §11](docs/data-system.md).
- **Anything stored in the browser** (a localStorage key, a persisted store, IndexedDB, Cache Storage, a cookie) is listed in the local-data inventory, `src/services/local-data/inventory-*.ts`, in the category a person would look for it under. Settings > Data on this device and `/help/local-data` read that list, and `tests/services/local-data/inventory-guard.test.ts` fails on a key it does not hold. See [docs/data-system.md §11](docs/data-system.md).
- **Persisted per-user state** is a Zustand `persist` store with an `ensureXForAccount(pubkey)` helper registered in `PER_ACCOUNT_STORES` (`src/services/read-state/root.tsx`). See [docs/read-state.md](docs/read-state.md).
- **Voice.** `VoiceClient` (`src/services/voice/client.ts`) is the only surface the UI sees; it picks mesh or SFU (`topology.ts`: SFU for a `voice-sfu` channel). See [docs/voice/README.md](docs/voice/README.md) and [docs/sfu-system.md](docs/sfu-system.md).

## Testing

A change is not done until its tests are written and passing. Scope: for a small local change run the affected test files (plus lint or typecheck where relevant); for bridge, auth, protocol, shared state or cross-cutting changes run `npm test` in full.

- Tests live in `tests/`, mirroring `src/`, and import the code as `@/...`. Shared setup, fakes and mocks are in `tests/support/` (`setup.ts`, `fake-bridge.ts`, `render-with-bridge.tsx`, `intl.tsx`, `messages.ts`, `import-graph.ts`, `mocks/`), imported as `@tests/support/...`.
- A component or hook test fakes the bridge instance, not the module: `renderWithBridge(<X />, fakeBridge({ groups }, { publishEvent }))`, or `bridgeWrapper` for `renderHook`. The real hooks run over seeded stores, and `fake.stores.groups.set(...)` inside `act` drives a change. A new `vi.mock('@/services/nostr-bridge', ...)` is not allowed (`tests/bridge-mock-count.test.ts`).
- The page bridge lives on `globalThis` (`bridge-slot.ts`), so `vi.resetModules()` does not forget it: call `unregisterBridge()` for a fresh one, or `registerBridge(fake)` in a non-React suite.
- Bridge integration suites (`tests/services/nostr-bridge/bridge*.test.ts`, `login-race.test.ts`, ...) run on a `FakePool` that stands in for nostr-tools' `SimplePool` (`tests/services/nostr-bridge/support/bridge-fake-pool.ts`, with `bridge-harness.ts`). It implements `subscribe`, `publish`, `close` and `ensureRelay`, because `connect()` awaits the handshake. RelayHub tests build hubs on `FakeRelayFactory` (`src/lib/relay-hub/fake-relay.ts`).
- Use `data-testid` for selectors. Wrap a component that reads messages in `LocaleProvider` from `tests/support/intl.tsx`.

### Guard tests

These read the source and fail the run. Lists marked "shrink-only" fail when an entry is no longer needed, so remove it in the same commit that fixes it, and never raise a cap.

| Test | Enforces |
|---|---|
| `tests/eslint-config.test.ts` | The 300-line `max-lines` rule is on for `src/` and loosened nowhere; every path-scoped glob in `eslint.config.mjs` matches a file |
| `tests/no-em-dash.test.ts` | No em dash in `src/`, `tests/`, `scripts/`, `docs/`, `content/`, `.github/`, `.claude/`, text assets in `public/`, or root files |
| `tests/import-cycles.test.ts` | No static import cycle in `src/` |
| `tests/hooks/hooks-layer.test.ts` | No hook file or hook definition under `src/components/` or `src/app/` |
| `tests/components/components-only.test.ts` | Only component modules under `src/components/` and `src/app/` (plus Next.js conventions); shrink-only exception list |
| `tests/services/nostr-bridge/front-door.test.ts` | Nothing outside the bridge imports a path inside it; shrink-only allow-list |
| `tests/bridge-in-react-files.test.ts` | No `getBridge` / `getBridgeImpl` under `src/components`, `src/app`, `src/hooks` (one reasoned exception) |
| `tests/app/bridge-provider-routes.test.ts` | Every page that ships the bridge renders under a provider; the landing and marketing pages ship without it |
| `tests/bridge-mock-count.test.ts` | The number of test files mocking `@/services/nostr-bridge` only goes down |
| `tests/services/nostr-bridge/fake-bridge-shape.test.ts` | The test fake has every store and `subscribeX` the facade has |
| `tests/services/nostr-bridge/bounded-stores.test.ts` | Every bridge store that grows with relay traffic has a cap and an eviction order |
| `tests/lib/relay-hub/isolation.test.ts` | `src/lib/relay-hub/` imports only `nostr-tools` and itself |
| `tests/components/raw-button-cap.test.ts` | Raw `<button>` count in `src/components/` and `src/hooks/` stays at or under its cap; only the ui primitives may render one |
| `tests/app/raw-buttons.test.ts` | The same ratchet for the desktop routes in `src/app/` |
| `tests/i18n/hardcoded-strings.test.ts` | No hardcoded user-visible copy; the baseline is zero |
| `tests/i18n/locales.test.ts` | Locale parity: one file per module per locale, the same keys and ICU arguments as English, no empty values, no "forum", no em dash |
| `tests/i18n/route-scopes.test.ts` | Every route renders inside an `IntlScope`, and no client file reachable from a route reads a module the route does not ship |
| `tests/i18n/call-arguments.test.ts` | Every literal `t('key', {...})` passes exactly the arguments the English message declares |
| `tests/i18n/next-config.test.ts` | Old guide URLs redirect permanently; the proxy sees the request URL as sent |
| `tests/utils/seo/guide-content.test.ts`, `tests/app/og-images.test.ts` | Every guide's search title and description fit (45-57, 145-157 characters, all languages); every indexed page has its own `opengraph-image` route |
| `tests/utils/nip-kinds.test.ts` | No local `KIND_` constant or raw numeric kinds filter outside its shrink-only debt lists |
| `tests/hooks-after-early-return.test.ts` | No hook call after an early return in a component |
| `tests/app/dev/dev-routes.test.ts` | Nothing under `src/app/dev/` is routable outside `next dev` |
| `tests/app/[locale]/app/lazy-mounts.test.tsx` | Voice, games, DM calls and game engines stay out of the shell's first download |
| `tests/app/[locale]/app/navigation-invariants.test.ts`, `deep-link-gate.test.ts` | Desktop navigation goes through the shell's view state; `?relay=` deep links go through `useRelayDeepLink` |
| `tests/csp.test.ts`, `tests/service-worker-cache.test.ts` | The CSP from `src/proxy.ts`; what `public/sw.js` may cache |
| `tests/services/local-data/inventory-guard.test.ts` | Every storage key, persisted store and IndexedDB database in `src/` is in the local-data inventory; IndexedDB only from the session vault and the DM store; `NOT_STORAGE` is shrink-only |
| `tests/services/analytics/gtag.test.ts` | Only `src/services/analytics/gtag.ts` loads gtag.js; no layout or page carries it |

`scripts/check-source-bytes.sh` (CI) rejects raw control bytes in tracked files.

## Known debt

Verified on 2026-10-06. Do not add to any of these.

- Local `KIND_*` constants remain in five `src/services/social/` files, and raw kind numbers in a few filters; the lists are in `tests/utils/nip-kinds.test.ts`.
- `normalizeRelayUrl` exists twice with different signatures: `src/utils/relay-url/normalize.ts` (canonical) and `src/services/social/relays.ts` (the social tier's).
- The muted-channel marker is still the `🔕` emoji in `mobile/screens/ChannelRow.tsx` and `panes/GroupNode.tsx`.
- Hooks outside the hooks layer: the bridge's own hooks (`src/services/nostr-bridge/hooks/`), `useRemoteMediaGate` (`src/services/remote-media-gate.ts`, on the front-door allow-list) and `useWotStore` (`src/services/wot/store.ts`). `ReadStateRoot` (`src/services/read-state/root.tsx`) is a component in services.
- `tests/support/mocks/ndk.ts` mocks a library that is no longer a dependency; nothing imports it.
- Open bugs: [docs/known-bugs.md](docs/known-bugs.md), [docs/sfu-known-bugs.md](docs/sfu-known-bugs.md).
