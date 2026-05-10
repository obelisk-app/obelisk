# Auth & data loading

How Obelisk authenticates a user and how relay-derived state arrives in the
UI. This is the contract every chat, profile, and admin feature relies on.

> If you are debugging a "needs to refresh 2-3 times after login" report,
> start at [§3 The login → connect contract](#3-the-login--connect-contract)
> and [§5 Subscription fan-out](#5-subscription-fan-out).

## 1. Architecture in one paragraph

Obelisk is fully Nostr-relay-only. There is no backend, no Postgres, no
session cookie. The whole client is a thin shell over
`src/lib/nostr-bridge/client.ts`, which wraps `nostr-tools`' `SimplePool` with:

- a session that's persisted in `localStorage` and carries one of the three
  signer kinds (nsec, NIP-07, NIP-46 bunker);
- a NIP-42 auto-auth callback so AUTH-required relays get challenge replies
  signed transparently;
- a fan-out of `StateStore`s (groups, messages, admins, members, ...) that
  React components subscribe to via the hooks in
  `src/lib/nostr-bridge/stores.ts`.

CLAUDE.md still describes a Next.js + Postgres + Socket.io stack — that is
**legacy** documentation; the actual code path is `bridge → SimplePool →
relays`.

## 2. Three login methods

| Method | Signer | Persisted in localStorage | First-publish latency |
|---|---|---|---|
| **NIP-07 extension** | `window.nostr` (Alby, nos2x, nostr-wot, …) | `pubKeyHex`, `loginMethod: 'nip07'`, `relayUrl` | ~0 — extension is in-process |
| **nsec (raw key)** | `nostr-tools` `finalizeEvent` | `privKeyHex`, `pubKeyHex`, `loginMethod: 'nsec'`, `relayUrl` | ~0 — local crypto |
| **NIP-46 bunker** | `BunkerSigner` from `nostr-tools/nip46` | `pubKeyHex`, `loginMethod: 'bunker'`, `bunkerUrl`, `bunkerLocalSecretHex`, `relayUrl` | 1-3 s — remote signer round-trip |

Bunker has two entry shapes: a `bunker://...` URL (paste flow) and a
`nostrconnect://...` URI (QR flow, generated locally). Both end up creating
the same kind of `BunkerSigner`; the QR path is `BunkerSigner.fromURI` and
keeps a local secret so the connection survives reload.

## 3. The login → connect contract

> Pre-fix history: this contract was violated. `isLoggedIn` was set to
> `true` *before* `await connect()` resolved. AppShell mounted the chat UI,
> components fired per-group REQs against an unauthenticated socket, and
> the relay dropped them silently. Symptom: needs 2-3 page refreshes for
> admin badges, members, etc., to appear.

All four login entrypoints (`loginWithNsec`, `loginWithNip07`,
`loginWithBunker`, `createNostrConnectSession.waitForConnection`) plus the
page-reload rehydration path in `initialize()` route through the private
`finalizeLogin()`:

```
1. persist()                       // write session to localStorage
2. resetPoolForSessionChange()     // close + rebuild SimplePool with the new session
3. await connect()                 // ensureRelay handshake + open global subscriptions
4. isLoggedIn.set(true)            // flip the gate AppShell observes
```

Order matters. Step 4 is last so `useIsLoggedIn() === true` always implies
"the relay handshake completed and the global REQs (group metadata,
incoming DMs, contact list, own kind:0) are open." If `connect()` throws
(no relays reachable) the gate stays closed and the SDK's `<LoginWidget>`
keeps its spinner + inline error visible — the throw propagates up out
of the host's `onLogin → routeToBridge → bridge.login*`, the widget's
`handleAttached` catches it and renders the message in the `nui-error`
slot. See [docs/nostr-wot-sdk-fork.md](nostr-wot-sdk-fork.md) for how
the fork's `onLogin` extras (`nsec`, `bunkerUri`, `clientNsec`) feed
each bridge entrypoint.

For NIP-46 specifically, the bunker signer's own handshake
(`BunkerSigner.connect()`) runs **before** `finalizeLogin()` — so by the
time `connect()` issues its first REQ, the relay's NIP-42 challenge can be
signed without a cold round-trip.

## 4. Pool reset on session change

`resetPoolForSessionChange()` (in `client.ts`) tears down the existing
SimplePool and rebuilds it. Why: `SimplePool.subscribe` queues NIP-42 AUTH
state per-socket. If the pool was opened earlier with a different (or
absent) session, the relay can settle into a no-auth state and silently
filter out auth-required reads. A fresh socket forces a new AUTH round-trip
with the just-installed signer.

The function snapshots the per-group REQs that were live on the old pool
into `pendingResubscribe` and `connect()` re-issues them on the new pool.
Without this, components mounted before login keep their store listeners
wired up but have no live subscription feeding them.

## 5. Subscription fan-out

```
finalizeLogin()
└── connect()
    ├── ensureRelay(url)                              [per relay, with timeout]
    ├── subscribeGroupMetadata()                      [global, kind 39000]
    │     └── ingestGroupMetadata(ev)                 [for each kind 39000 ev]
    │         ├── this.groups.update(...)
    │         └── subscribeGroupMessages(groupId)     [per group, kind 9, limit: BACKGROUND_MESSAGE_LIMIT]
    ├── subscribeIncomingDMs()                        [global, kind 4 with #p=me / authors=me]
    ├── subscribeMyContactList()                      [global, kind 3 authors=me]
    └── ensureUserMetadata(my pubkey)                 [kind 0 authors=me]
```

Admin/member (39001/39002) and reactions (kind 7) are intentionally NOT
fanned out at discovery time — they're lazy on first
`useAdmins` / `useMembers` / `useReactions` call from a chat panel.
Fanning out per-group REQs to every joined group on login was expensive
on accounts in many channels and slowed setup of recently-created
groups. See [progressive-loading.md](./progressive-loading.md) for the
full ordering, message-backfill cap (`BACKGROUND_MESSAGE_LIMIT`), and
"Load earlier" pagination.

`subscribeAdminMember` is idempotent: a later `useAdmins` call from a chat
panel is a no-op if the per-group sub is already open.

**Read-state relay sync** opens additional global REQs at login, mounted
from `AppGate.tsx`'s `ReadStateRoot`:

- One `{kinds:[1059], "#p":[me]}` sub per configured relay → groups-scope
  read state (gift-wrapped). Relay-targeted via the `relays` override on
  `subscribeFilterWatched`.
- One `{kinds:[1059], "#p":[me]}` sub per NIP-65 read+write relay (from
  `fetchMyDmRelays`) → DM-scope read state.

Each unwrapped rumor is filtered by inner kind 30078 and the scope's
d-tag; matching cursors merge into `useReadStateStore` via
`applyRemoteState`. See [docs/notifications.md](./notifications.md) for
the encryption/wrap protocol and the 60-second debounced publish.

## 6. NIP-42 AUTH

`BridgeImpl.createPool()` registers `automaticallyAuth(_relayUrl)` with
SimplePool. When a relay sends an AUTH challenge:

1. SimplePool calls our callback with the challenge event template.
2. The callback dispatches by `loginMethod`:
   - **nsec**: `finalizeEvent(template, sk)` — synchronous local crypto.
   - **nip07**: `window.nostr.signEvent(template)` — extension RPC.
   - **bunker**: `await ensureBunkerSigner()` then `signer.signEvent(template)`.
3. SimplePool sends the signed event back as an AUTH frame and retries the
   queued REQ.

The bunker path is special: cold `BunkerSigner.connect()` takes 1-3 s, and
some relays time out their AUTH window before that completes. To avoid a
dropped REQ → watchdog retry → "needs 2-3 refreshes" cascade, `initialize()`
pre-warms the bunker signer fire-and-forget before `connect()` runs (Fix C).
On a flaky bunker relay the warm-up just fails; the lazy fallback in
`getAuthSigner` still runs on the next AUTH challenge.

`bunkerSignerReady` (a `StateStore<boolean>`) tracks the warm state and is
exposed via `useBunkerSignerReady()`. Generic "ready to publish" derives as
`useSignerReady()` — `loggedIn && (loginMethod !== 'bunker' || bunkerSignerReady)`.

## 7. Watchdog tunables

`subscribeWatched` (`client.ts`) wraps `pool.subscribe` with a per-sub
watchdog. If neither EVENT nor EOSE arrives within `watchdogMs`, it closes
the sub and re-issues with exponential backoff (1s/2s/4s/8s).

| Path | watchdogMs | maxAttempts | Worst-case wait |
|---|---|---|---|
| Group metadata (39000) | 5000 | 4 | ~27 s |
| Group messages (9, `#h`) | 5000 | 4 | ~27 s |
| Admin/member (39001+39002, `#d`) | 5000 | 4 | ~27 s |
| Incoming DMs (4) | 5000 | 4 | ~27 s |
| Own contact list (3) | 5000 | 4 | ~27 s |
| **kind:0 metadata** | 3000 | 2 | ~6 s |
| **Reactions (7, `#h`)** | 3000 | 2 | ~6 s |

Critical paths keep the conservative defaults — losing them means an empty
UI. Non-critical paths (kind:0, reactions) override with tighter values: a
missed kind:0 just shows the npub instead of a display name; a missed
reaction just delays an emoji badge.

## 8. bridgeCache (stale-while-revalidate)

`src/lib/nostr-bridge/cache.ts` is a small `localStorage`-backed cache for
relay-derived state. The contract: callers `cacheGet` for instant paint,
then let live relay events overwrite via `StateStore.update`. There is no
TTL — relays are the source of truth and `created_at`-newest-wins replaces
the cache entry through `cacheSet`.

Storage key shape: `obelisk-cache/<relay>/<kind>/<id>`. Each entry is a
JSON `{ v, t }` payload (value, write-timestamp).

| Wired through cache | Status |
|---|---|
| **kind 39001 / 39002** (admin/member lists) | ✅ shipped — `client.ts` `ingestAdminMember` writes; `seedCacheForRelay` reads on `initialize`/`switchRelay` |
| kind 39000 (group metadata) | TODO — `ingestGroupMetadata` |
| kind 0 (user profile) | TODO — `ingestUserMetadata` |
| kind 30078 (channel layout) | TODO — `channel-layout.ts` |
| relay branding | TODO — `relay-branding.ts` |
| messages | not planned for v1 — would blow the 5MB localStorage cap |

Invalidation is explicit only:

- `cacheClearAll()` runs on logout — `bridge.logout()` invokes it before
  resetting the in-memory stores.
- `cacheDelete(relay, kind?, id?)` for surgical removal (relay-only or
  kind-only prefix wipes are supported).

We deliberately do **not** invalidate on relay switch — caches for the
previous relay stay on disk and re-paint instantly if the user switches
back.

## 9. Logout

`bridge.logout()`:

1. Closes the bunker signer (if any) and nulls it.
2. Clears `session` and the persisted `STORAGE_KEY` localStorage entry.
3. `cacheClearAll()` — wipes every `obelisk-cache/...` key.
4. `dispose()` + recreate pool — closes all sockets.
5. Resets every reactive `StateStore` (`isLoggedIn`, `bunkerSignerReady`,
   `myPubkey`, `myLoginMethod`, `connectionState`, groups, messages,
   admins, members, membership-ready).
6. `resetAllClientState()` (`src/lib/reset.ts`) — clears chat /
   notification / voice / DM module state so the next user logging in on
   this browser doesn't inherit the previous account's data.

## 10. Manual verification

For each login method, **clear localStorage** then:

1. **NIP-07 extension** — log in → sidebar populates within ~2 s; gear icon
   on owned channels visible on **first** paint, no refresh needed. Reload
   → sidebar paints instantly from cache before the relay round-trip
   completes.
2. **nsec** — paste a key with admin rights on a known channel → admin
   badge visible immediately. Reload → admin badge from cache, instant.
3. **Bunker URL** — paste `bunker://…@relay.nsec.app/?secret=…`, approve in
   the remote signer → channel list + admin status appear without refresh.
   Reload → bunker pre-warm fires; first AUTH challenge completes in <3 s.
4. **NostrConnect QR** — scan with Amber/nsec.app → connect → first
   publish (e.g. send a message) succeeds without retry.
5. **Slow relay** — DevTools → Network → "Slow 3G" — repeat (1)–(3). The
   SDK's `<LoginWidget>` "Signing in…" spinner should remain visible until
   the relay handshake completes; no empty-sidebar flash.
6. **Network tab during page load** — zero requests to `/api/auth/*`,
   `/api/members/*`, `/api/forum/*`, `/api/invoices/*`. Confirms the
   legacy backend purge.

## 11. Test coverage

- `src/lib/nostr-bridge/cache.test.ts` — round-trip, isolation by relay/kind,
  prefix-wipe deletion, JSON corruption resilience.
- `src/lib/nostr-bridge/login-race.test.ts` — Fix A (`isLoggedIn` flips
  after `connect`), Fix B (eager admin/member sub on group discovery),
  Fix C (bunker pre-warm in `initialize`), Fix D (admin list persisted
  through `cacheSet`).
- `src/lib/nostr-bridge/bridge.test.ts` — pre-existing integration test;
  the FakePool now implements `ensureRelay` to match `connect()`'s
  awaited contract.
