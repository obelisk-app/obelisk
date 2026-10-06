# Data system

How Obelisk loads data from relays, what runs first, how connection state
and whitelist rejection surface, and how the local cache fits in.

This doc supersedes the legacy `auth-and-data-loading.md` and
`progressive-loading.md`. Read this together with
[`read-state.md`](./read-state.md), which covers the parallel notification
/ cursor-sync system.

## 1. Architecture in one paragraph

Obelisk is fully Nostr-relay-only. The whole client is a thin shell over
the bridge (`src/services/nostr-bridge/`, facade `client.ts`), whose every
REQ, query and publish goes through the page's RelayHub
(`src/lib/relay-hub/`): one socket per relay per identity, NIP-42 AUTH once
per relay and pubkey, a shared refcounted subscription registry.
Identity is one of three signer kinds (nsec, NIP-07, NIP-46 bunker). Group
state, members, admins, messages, DMs, and reactions all arrive as NIP-29
/ NIP-04 / NIP-17 events that fan out into a set of `StateStore`s the React
components subscribe to. There is no backend, no Postgres, no session
cookie.

## 2. Login methods

| Method | Signer | Persisted in localStorage (`obelisk-dex/session`) | First-publish latency |
|---|---|---|---|
| **NIP-07 extension** | `window.nostr` (Alby, nos2x, …) | `v: 2`, `pubKeyHex`, `loginMethod: 'nip07'`, `relayUrl` | ~0 (extension is in-process) |
| **nsec (raw key)** | `nostr-tools` `finalizeEvent` | `v: 2`, `pubKeyHex`, `loginMethod: 'nsec'`, `relayUrl`, `sealed` (holds `privKeyHex`) | ~0 (local crypto) |
| **NIP-46 bunker** | `BunkerSigner` from `nostr-tools/nip46` | `v: 2`, `pubKeyHex`, `loginMethod: 'bunker'`, `relayUrl`, `sealed` (holds `bunkerUrl`, `bunkerLocalSecretHex`) | 1-3s (remote signer round-trip) |

### Secrets at rest: the session vault

No secret is written to localStorage in the clear. `sealed` is an AES-GCM box
(`{ v: 1, iv, ct }`, base64url, bound to `pubKeyHex` as additional data) made
by `src/lib/crypto/session-vault.ts`, whose key is a non-extractable
`CryptoKey` stored in IndexedDB (`obelisk-vault` / `keys` / `session-key`):
the browser can use it, no script can read its bytes. The key is rotated on
every login and deleted on logout. The bridge side is
`src/services/nostr-bridge/session/persistence.ts` (seal once per login,
write synchronously from the cached box, open on reload) and `./vault.ts`.

- **A pre-vault record** (secrets in plain JSON) is sealed and rewritten on
  the first load that finds it; the plaintext is gone once that write lands.
- **No IndexedDB or no WebCrypto** (some private windows, storage turned
  off, a non-secure origin): the login works for that visit only, nothing is
  written, and `sessionNotice` is `not-remembered` (a toast says so). A
  plaintext record found in that state is erased the same way.
- **A sealed record that will not open** (key gone, box tampered with,
  IndexedDB gone since): the record is erased, the person is logged out, and
  `sessionNotice` (`vault-unavailable`, `key-missing`, `unlock-failed`) is
  explained above the login methods.
- **The SDK login widget** gets memory-only signer storage
  (`src/services/login/signer-storage.ts`), so its NIP-46 pairing record and
  "remembered" nsec never reach localStorage; the bridge erases the two
  `@nostr-wot/ui:*` keys older builds left behind on every load and logout.

Direct messages are kept on disk the same way in spirit, under a key of
their own that the signer wraps rather than one the browser keeps: the
encrypted DM store (`obelisk-dms`), opened once per visit when the person
opens their DMs. See [direct-messages.md, Storage](direct-messages.md#storage-the-encrypted-dm-store).

This protects the key on disk (a copied profile, a backup, a script that
greps storage files). It does not protect it from code running inside the
page, which can ask the browser to decrypt exactly as the app does; a
browser extension (NIP-07) or a bunker (NIP-46) keeps the key out of the
page entirely, which is why pasting an nsec shows a notice recommending them.

Bunker has two entry shapes: a `bunker://...` URL (paste flow) and a
`nostrconnect://...` URI (QR flow). Both end up creating the same kind of
`BunkerSigner`; the QR path is `BunkerSigner.fromURI` and keeps a local
secret so the connection survives reload.

## 3. The login → connect contract

All four login entrypoints (`loginWithNsec`, `loginWithNip07`,
`loginWithBunker`, `createNostrConnectSession().waitForConnection`) route
through `finalizeLogin()` (`src/services/nostr-bridge/session/login.ts`).
The page-reload rehydration (`session/restore.ts`) repeats the same steps
rather than calling it, so a step added to one belongs in the other:

```
1. seal() + persist()     // seal the secrets in the session vault, write the session record
2. reset session state    // the hub gets the session identity; subscription bookkeeping restarts
3. await connect()        // handshake on the active relay + the session fan-out (session/fanout.ts)
4. isLoggedIn.set(true)   // flip the gate the shell observes
```

Step 4 is last so `useIsLoggedIn() === true` always implies "the relay
handshake completed and the P0 REQs are open." If
`connect()` throws, the gate stays closed and the login modal surfaces
the error.

Inside `connect()` (`session/connection.ts`), the handshake itself is a
first-response-wins race:

- Per-socket handshake timeout: `CONNECT_HANDSHAKE_TIMEOUT_MS = 10_000`
  (`page-hub.ts`; 3s tore healthy relays down behind Cloudflare after a
  resume).
- `Promise.any` over the handshakes: the first relay to connect flips the
  gate, and slower relays handshake in the background.

The first successful handshake triggers the fan-out. The hub owns the
sockets, their reconnects and the REQs on them: subscriptions registered
later bind as each socket comes online, and every live REQ is re-issued on
the next socket generation.

## 4. Priority tiers

> There is no orchestrator module any more. After the first handshake
> `connect()` calls `openSessionSubscriptions` (`session/fanout.ts`): the
> P0 tier at once, the P2 tier on the next microtask, then the per-group
> REQs a reset released, the channel in view first. The hub's registry
> orders the wire the same way (`voice > active > dm > background`). The
> table describes the ordering and the watchdog/cache behaviour of each
> REQ; some names below are the older method names.

The plan:

| Tier | Action | When | Watchdog | Affects relay-access | Cache |
|---|---|---|---|---|---|
| **P0** | `preflightRelayAccess` (kind 0 `authors:[me]` limit 1) | After `ensureRelay` resolves | 1500ms / 1 attempt; immediate downgrade on `auth-required:`/`restricted:` | yes (authoritative) | n/a |
| **P0** | `subscribeGroupMetadata` (39000) | Parallel with preflight | 5000ms / ∞ | yes | yes (write + seed) |
| **P0** | `ensureMyMetadata` (kind 0 for `myPubkey`) | Parallel with preflight | 3000ms / 2 | no | yes (write + seed) |
| **P1** | Active channel: kind 9 `limit:50` + `subscribeAdminMember(activeId)` + kind 7 reactions | On `setActiveGroup` | 5000ms / ∞; reactions 3000ms / 2 | no | n/a / yes / no |
| **P2** | Background channels: kind 9 `limit:50` via `queueGroupMessages` drain (4 per 80ms) | After `ingestGroupMetadata` per group | 5000ms / ∞ | no | no |
| **P2** | `subscribeAllAdminMember` (relay-wide 39001+39002, no `#d`), bootstraps layout authors | After P0 EOSE | 5000ms / ∞ | no | yes (per-group) |
| **P2** | `subscribeIncomingDMs` (kind 4 `#p:[me]` + `authors:[me]`; kind 1059 NIP-17 wraps `#p:[me]`) | On first `subscribeDirectMessages`, only if `directMessagesEnabled` | 5000ms / ∞ | no | n/a |
| **P2** | `subscribeMyContactList` (kind 3, on PROFILE_RELAYS) | After P0 EOSE | 5000ms / 4 | no | n/a |
| **P2** | `subscribeMyMuteList` (kind 10000) | After P0 EOSE | 5000ms / 4 | no | n/a |
| **P2** | `subscribeMyAuthoredGroups` (kind 9007 `authors:[me]`) | After P0 EOSE | 5000ms / ∞ | no | yes (per-group) |
| **P2** | `subscribeActiveCalls` (kind 31314) | After P0 EOSE | 5000ms / ∞ | no | no |
| **P0** | Read-state relay-sync, **groups scope** (kind 1059 `#p:[me]`, ACTIVE relay only) | As soon as `myPubkey` + `activeRelay` + first group are known; fires before messages paint so unread badges don't flash | 5000ms / ∞ | no | yes |
| **P2** | Read-state relay-sync, **DM scope** (kind 1059 `#p:[me]`, NIP-65 read+write union) | After NIP-65 list resolves (cross-relay; the only background fanout we tolerate) | 5000ms / ∞ | no | yes |
| **P3** | Per-group `subscribeAdminMember(id)` | On first `useAdmins`/`useMembers` mount | 5000ms / 4 | no | yes |
| **P3** | Batched kind 0 (up to 100 `authors` per REQ) | ~16ms after the first `ensureUserMetadata` in a burst | 3000ms / 2 | no | yes |

Implementation notes:
- **Kind 0 lookups are batched, and only the open channel is prefetched.**
  Profile demand scales with relay size rather than with what's on screen:
  the relay-wide 39001/39002 REQ delivers a membership list for *every*
  group hosted on the relay, so a public directory relay names thousands
  of pubkeys the user will never see. `ensureUserMetadata` therefore
  queues rather than subscribes: `flushKind0Queue` folds the burst into
  one multi-author REQ per 100 pubkeys (plus one query per profile-lookup
  relay covering the same batch), and `ingestAdminMember` only warms
  profiles for `activeGroupId`. Members of unopened channels resolve
  lazily, when a row renders and calls `subscribeUserMetadata`. Before
  this, opening `groups.0xchat.com` (1265 groups / 2861 distinct member
  pubkeys) put ~26k REQ frames on the wire in two minutes, tripped the
  relay's per-connection sub limit, and blocked the main thread long
  enough for the browser to kill the tab.
- P0 actions are dispatched synchronously inside `connect()` (in the same
  microtask). P2 actions are dispatched on `queueMicrotask`, so their
  WebSocket frames go out strictly after P0 frames.
- Read-state relay-sync is split: the **groups scope** (active relay
  only) fires unconditionally: it must land before messages paint so the
  unread badges don't flash on then off when cursors arrive. The **DM
  scope** (NIP-65 read+write union) is still gated by `useReadyToSync()`
  in `src/services/read-state/root.tsx`. See [`read-state.md`](./read-state.md).
- **Architectural rule (single-relay groups, cross-relay DMs):**
  every background subscription except DMs and DM-state sync runs on
  `this.relays = [activeRelay]` only. Fanning a non-DM REQ across
  `useConfiguredRelays()` opens sockets to whitelist-gated relays the
  user hasn't AUTH'd against, leaks pubkey via the NIP-42 challenge, and
  produces the `Tried to send AUTH on a closed connection` loop. If you
  add a new background sub, it goes on the active relay. Future in-OS
  notifications (browser Notification API / service-worker push) are
  DM-only too.
- `pendingResubscribe` (per-group REQs that were live on the previous
  pool) is applied at the end of the P2 microtask via
  `applyPendingResubscribe`, with the active group bumped to the head of
  the queue.

`subscribeAllAdminMember` deliberately stays: its single relay-wide REQ
seeds the layout-author set used by NIP-78 channel-layout queries. See
[`relay-layout-and-branding.md`](./relay-layout-and-branding.md).

## 5. Whitelist preflight

`preflightRelayAccess()` fires `{kinds:[0], authors:[me], limit:1}` on the
active relay with these `subscribeWatched` options:

```
watchdogMs: 1500
maxAttempts: 1
affectsRelayAccess: true
immediateAccessDowngrade: true
```

`immediateAccessDowngrade`: when the preflight sub closes with an
access rejection, `setRelayAccess(url, state, { override: true })` runs
directly instead of going through `setRelayAccessDeferred` (the default 4s
soak that absorbs transient AUTH races for the rest of the fan-out).

**How a refusal is told apart from an AUTH problem** (`classifyAccessClose`
in `src/services/nostr-bridge/relay-rejection.ts`). Every watched sub passes `onauth`, and nostr-tools
(`abstract-pool.js` `subscribeMap`) handles a CLOSED whose reason starts
with `auth-required: ` itself: it swallows the CLOSED, runs NIP-42 AUTH, and
resubscribes. What the bridge then sees is one of:

| Reason reaching `onclose` | Meaning | State |
|---|---|---|
| `auth-required: …` (bare) | AUTH got `OK true` and the resubscribed REQ was **still** refused | `restricted` |
| `auth was required and attempted, but failed with: <inner>` | AUTH itself failed (signer declined/threw, `auth timed out`, `OK false`) | the inner reason's class, else `auth-required` |
| `restricted: …` / `blocked` / `whitelist` / `forbidden` … | explicit refusal | `restricted` |
| quota / rate-limit wording | transient load shedding | none (never a verdict) |

A post-AUTH refusal skips the soak on **every** access-affecting sub, not
just the preflight (non-preflight subs still respect sticky-OK).

**Timing.** The probe goes out right after the first handshake. The relay
challenges on connect, so the hub is usually already signing (§7). The 1.5s
watchdog waits while the socket's AUTH prompt is in flight (the hub's
registry holds a sub's watchdog for that), not only a prompt this sub
started: AUTH is one record per relay and pubkey, so the probe rarely starts
one itself, and a slow extension or bunker approval used to kill the probe
with no verdict. The banner now appears one round-trip after the user approves AUTH
(or at once for nsec).

**Verdicts are sticky** (`relay-access.ts`). Once a relay has answered
`'ok'`, only an explicit rejection (`override`) can downgrade it, so a
mid-session AUTH refresh never flips the banner back to "Authenticating…".
`'restricted'` ignores a later `'auth-required'` or `'authenticating'`.
Only `'ok'` (an EVENT or EOSE, e.g. after the operator whitelists the key)
or a relay/session change clears it.

**EOSE is not proof of access.** nostr-tools' pool fires a synthetic EOSE
for every relay-sent CLOSED (`handleClose` → `handleEose`, in the same tick,
just before `onclose`). So on a refusing relay *every* REQ reports EOSE, then
CLOSED. Two rules follow:
- an EOSE can't lift `'restricted'`; only a delivered EVENT can;
- a relay-wide refusal (post-AUTH `auth-required:`, or `restricted:` naming the
  whitelist) overrides sticky-OK on any access-affecting sub.

Without them, the next refused sub's EOSE flipped the verdict back to `'ok'`, and
the phone shell said "No channels found" instead of "Whitelisting required".

EOSE on the preflight filter flips `relayAccess` to `'ok'` via the standard
onevent/oneose path. An EOSE-then-CLOSED refusal still downgrades, because
the preflight overrides sticky-OK.

### 5a. Relay-side contract for access rejection

The client can only show "Not whitelisted" quickly if the relay says so in
a form it can classify. A relay that gates on pubkey should:

1. **Send the NIP-42 challenge on connect**, before any REQ. The client
   starts signing immediately, so the first REQ isn't stuck waiting on a
   human.
2. **Accept any validly signed AUTH** with `OK true`. Enforce the allowlist
   per REQ/EVENT, not in the AUTH reply. (An `OK false` on AUTH reaches the
   client only inside nostr-tools' `auth was required and attempted, but
   failed with:` wrapper.)
3. **Use `auth-required:` only for a socket that has not authenticated.**
   nostr-tools AUTHs and retries only on that exact prefix (with the trailing
   space); `restricted:` on an unauthenticated socket makes every write on a
   fresh socket fail for good.
4. **Use `restricted:` for an authenticated key that isn't admitted**, on
   REQ (`CLOSED <sub> "restricted: …"`) and on EVENT (`OK <id> false
   "restricted: …"`). Put the word `whitelist` in the message: the client
   treats a publish refusal that names the whitelist as a relay-wide verdict
   (no soak), while other `restricted:` OKs such as NIP-29 membership stay
   per-group.
5. **Never use whitelist wording for quota or rate limits.** The client
   drops reasons containing `rate limit`, `too many`, `slow down`, `quota` or
   `concurrent` before classifying, even with a `restricted:` prefix.
6. **Don't answer a refused key with a silent empty EOSE.** That can't be
   told apart from an empty relay. The client reads it as `'ok'` and the user
   sees an empty sidebar with no explanation.

**obelisk-relay today.** The write path already follows (3)/(4)
(`groups_event_processor.rs`, "Access denied: your pubkey is not whitelisted
on this relay"). The read path (`verify_filters`) answers every non-admitted
pubkey with `auth-required: Authentication required: this relay only accepts
whitelisted pubkeys`, authenticated or not. The client copes, via the
post-AUTH rule above. The relay-side fix mirrors the write path in
`verify_filters`: it returns `Error::restricted("Access denied: your pubkey is
not whitelisted on this relay")` when `context.authed_pubkey.is_some()`. The
fix is made on top of the live `obelisk-apps-manifest` branch (test
`an_authenticated_unadmitted_read_is_restricted`) but not yet deployed. It saves
a round-trip (no pointless AUTH-and-resubscribe) and makes the verdict
unambiguous to every client, not just this one. Keep the client rule anyway:
other relays, and older obelisk-relay builds, still answer the old way.

`switchRelay` resets the pool and re-runs `connect()`, so the preflight
fires for the new relay automatically.

## 6. Connection state

`BridgeImpl.connectionState: StateStore<string>` with values:

- `'Disconnected'`: initial state and after a socket close while the browser is online.
- `'Offline'`: the browser reports no network; cached state stays mounted and retries pause.
- `'Connecting'`: set at `connect()` start.
- `'Connected'`: set after the first relay handshakes.
- `'Error:<message>'`: set on `connect()` throw.

`relay.onclose` flips the state to `'Disconnected'` (or keeps `'Offline'`) and kicks
`reconnectInBackground()` with capped, jittered exponential backoff. Native relay pings detect half-open sockets; browser `online` and visible-tab events wake a pending retry immediately, while `offline` pauses retry traffic.

UI surface: `src/app/[locale]/app/RelayStatusBanner.tsx` (desktop, inside
`ActivityIndicator`) folds connection state and relay access into one
line. Connection problems win, then access: `authenticating` (yellow
spinner), `auth-required` (yellow "Not authenticated"), `restricted` (red
"Not whitelisted"), `unreachable`/`error` (red). It carries
`data-testid="relay-access-banner"` / `"connection-loss-banner"` and
`data-state`. Desktop also raises `RelayAccessModal` (`DesktopShell.tsx`)
for `restricted` / `auth-required` / `unreachable`. Mobile shows
`RelayStatusPill` in the header and "Whitelisting required" in the empty
channel list.

## 7. NIP-42 AUTH

AUTH belongs to the RelayHub (`src/lib/relay-hub/auth.ts`, policy in
`auth-policy.ts` and `auth-leases.ts`). It keeps one record per
`(relayUrl, pubkey)`, never per challenge, and installs exactly one signer
per socket, so a reconnect or a `created_at` rollover does not prompt the
signer again. The hub answers a challenge only where the identity holds an
AUTH lease: the session's `'active'` lease on the relay being browsed
(`session/connection.ts`), and `'dm'`, `'voice'`, `'watch'` (the
background watch) and `'publish'` leases held only while that work runs. A
DM call's identity is `never-auth` and answers none.
When the relay sends a challenge:

1. The hub signs the challenge template through the session signer
   (`session/signer.ts`), which dispatches by login method:
   - **nsec**: `finalizeEvent(template, sk)`, synchronous local crypto.
   - **nip07**: `window.nostr.signEvent(template)`, extension RPC.
   - **bunker**: the NIP-46 `BunkerSigner` (`session/bunker.ts`).
2. The signed event goes back as an AUTH frame. A REQ that was CLOSED with
   `auth-required: ` is re-issued by the registry once AUTH gets
   `OK true`; `restricted:` is terminal. If AUTH fails the record moves to
   `failed` and the next challenge retries.

The bunker path is special: cold `BunkerSigner.connect()` takes 1-3s, so
the page-reload restore (`session/restore.ts`) pre-warms the bunker signer
fire-and-forget before `connect()` runs. `bunkerSignerReady` (a `StateStore<boolean>`) tracks the
warm state; `useSignerReady()` derives `loggedIn && (loginMethod !== 'bunker' || bunkerSignerReady)`.

## 8. Watchdog tunables

`subscribeWatched` wraps `pool.subscribe` with a per-sub watchdog. If
neither EVENT nor EOSE arrives within `watchdogMs`, the sub is closed and
re-issued with exponential backoff (1s / 2s / 4s / 8s, capped at 30s).

| Path | watchdogMs | maxAttempts | Worst-case wait |
|---|---|---|---|
| **Preflight** (kind 0 `authors:[me]`) | 1500 | 1 | ~1.5s |
| Group metadata (39000) | 5000 | ∞ | unbounded |
| Group messages (kind 9, `#h`) | 5000 | ∞ | unbounded |
| Admin/member (39001+39002, `#d`) | 5000 | ∞ | unbounded |
| Relay-wide admin/member | 5000 | ∞ | unbounded |
| Incoming DMs (kind 4 + kind 1059) | 5000 | ∞ | unbounded |
| Own contact list (kind 3) | 5000 | 4 | ~27s |
| Mute list (kind 10000) | 5000 | 4 | ~27s |
| Authored groups (kind 9007) | 5000 | ∞ | unbounded |
| Active calls (kind 31314) | 5000 | ∞ | unbounded |
| Read-state sync (kind 1059) | 5000 | ∞ | unbounded |
| **kind 0 metadata** | 3000 | 2 | ~6s |
| **Reactions** (kind 7, `#h`) | 3000 | 2 | ~6s |

Per-channel and per-pubkey subs (group messages, admin/member, kind 0,
reactions) use `affectsRelayAccess: false` so a normal "you can't read
this one" CLOSED doesn't flip the relay-wide banner.

## 9. bridgeCache (stale-while-revalidate)

`src/services/nostr-bridge/cache.ts` is a small `localStorage`-backed cache. Startup indexes all required kinds in one storage scan and batches StateStore hydration by data type.
Keyed by `obelisk-cache-v4/<relay>/<kind>/<id>` (`cache-keys.ts`) with a `{ v, t }` payload; older prefixes are evicted on load.
No TTL: relays are the source of truth and `created_at`-newest-wins
replaces entries through `cacheSet`.

| Wired through cache | Writer | Seed reader |
|---|---|---|
| 39000 (group metadata) | `groups/metadata.ts` (`ingest`) | `seedCacheForRelay` (`seed.ts`) |
| 39001 (admin lists) | `groups/membership.ts` (`ingestAdminMember`) | `seedCacheForRelay` |
| 39002 (member lists) | `groups/membership.ts` (`ingestAdminMember`) | `seedCacheForRelay` |
| 9007 (group creators) | `groups/membership.ts` (`ingestGroupCreator`) | `seedCacheForRelay` |
| 0 (user metadata) | `profiles.ts` (`ingest`) | `seedCacheForRelay` (≤500 pubkeys) |
| 30078 layout | `channel-layout.ts:subscribeLayout` | self-seeds via `cacheGet` |
| 30078 branding | `relay-branding.ts:subscribeBranding` | self-seeds via `cacheGet` |

Invalidation is explicit only:
- `cacheClearAll()` runs on logout: wipes every `obelisk-cache-v4/*` key.
- `cacheDelete(relay, kind?, id?)` for surgical removal.
- Settings > Data on this device removes it by category, and the error
  panel's "Clear cache" calls `clearAllClientCacheExceptSession()` (see §11).

Cache is **never** invalidated on relay switch: caches for the previous
relay stay on disk and re-paint instantly on switch-back.

## 10. UI loading states

These mirror the priority order so the user always sees the highest-tier
data load first.

| Surface | Loading state | Source signal |
|---|---|---|
| Sidebar header banner | `lc-banner-placeholder` div in fixed-aspect slot, then real image fades in | `branding.updatedAt > 0` |
| Sidebar header title | `lc-skeleton` for up to 1500ms grace, then `branding.name \|\| shortHost(relay)` | `branding.updatedAt > 0` OR grace timer |
| Sidebar channel list (empty) | `lc-spinner` + "Loading channels…" → "No channels on this relay yet." | `groupMetadataEose` |
| Chat pane (no group) | "Loading channel info…" with `lc-spinner` | `!group && !groupMetadataEose` |
| Chat pane (group, no messages) | "Loading messages…" with `lc-spinner` | `group && !messagesEose` |
| Chat pane → "Load earlier" on scroll-to-top | `useLoadEarlier` returns `false` once `reachedStart` | scroll listener at top of `messagesRef` |
| Members panel (desktop) | `lc-spinner` + "Loading members…" | `useMembershipReady(groupId)` |
| Members screen (mobile) | `lc-spinner` + "Loading members…" → "No members" | `useMembershipReady(groupId)` |
| `RelayStatusBanner` (connection) | visible while `loggedIn && connectionState !== 'Connected'` | `useConnectionState()` |
| `RelayStatusBanner` (access) | visible for `authenticating` / `auth-required` / `restricted` / `unreachable` / `error` | `useRelayAccess()` |

Each loader has a stable `data-testid` so the Playwright specs can assert
paint order; see [`testing-strategy`](#13-test-coverage).

## 11. Local data: the inventory and removing it

Everything the app keeps in the browser is listed, as one typed list, in
`src/services/local-data/` (`inventory-cache.ts` for what the relays can
send again, `inventory-device.ts` for choices and secrets). Each entry says
what it holds, why it exists, whether it is per account and whether it is
sensitive, and belongs to one of twelve categories a person sees in
**Settings > Data on this device** (desktop: its own sidebar section; phone:
Preferences > Data on this device) and on `/help/local-data`:

| Category | What | After removal |
|---|---|---|
| `channels` | bridge cache (all but profiles and read-state), relay info, recent relays | reload |
| `profiles` | bridge cache kinds 0 and 3, profile-sync blobs, SDK TTL caches | reload |
| `readState` | `obelisk-read-state:*`, `obelisk-notifications:*`, `obelisk-wrap-ledger:*`, the read-state sync cache | reload |
| `dmMessages` | the `obelisk-dms` IndexedDB database: each account's DM key (wrapped by its signer) and one AES-256-GCM box per opened DM | `forgetDirectMessages()` (stop writing, drop the key), delete the database, reload |
| `dms` | `obelisk-dm-store:*` (per-peer protocol only) | reload |
| `preferences` | `obelisk:preferences`, layout widths, collapsed groups, hints, recents, game keys | reload |
| `personal` | `obelisk:moderation:*`, `obelisk-channel-prefs:*`, `obelisk:personal-stickers` (exist only here) | reload |
| `login` | `obelisk-dex/session`, `obelisk-dex/relays`, the `obelisk-vault` IndexedDB database | logout, delete the database, reload |
| `wallet` | `obelisk-dex/nwc:*`, the sealed Nostr Wallet Connect link | `disconnectNwcWallet()` (memory and the `wallet-key`), then reload |
| `offline` | the service worker's `obelisk-v*` caches, `obelisk-sw-version` | delete caches, unregister the worker |
| `language` | the `locale` cookie | reload without the language prefix |
| `analytics` | the Analytics answer (`obelisk:analytics-consent`) and, only if it is "allow", the `_ga` and `_ga_<id>` cookies gtag.js sets | `forgetAnalyticsConsent()` (opt-out flag, answer gone), expire the cookies; the question is asked again |

**Remove everything from this device** logs out, empties localStorage and
sessionStorage, deletes the vault and DM store databases, the offline
caches and the service worker registration, forgets the Analytics answer, expires the
language and analytics cookies, and reloads.

### Google Analytics only after consent

Nothing from Google is in any page's HTML. `AnalyticsConsentRoot`
(`src/components/analytics/`, mounted in the `[locale]` layout) renders
nothing on the server; in the browser it reads the answer
(`src/services/analytics/consent.ts`) and:

- no answer: shows the question (en, es, pt; `common.analyticsConsent`),
  with "Allow" and "Don't allow" as two equal buttons, and loads nothing;
- `granted`: `startAnalytics()` (`gtag.ts`) defines `dataLayer` and `gtag`
  from the bundle and appends one `<script src>` from
  `www.googletagmanager.com`, the CSP's only third-party script host
  (allowed by host, so no nonce reaches client code);
- `denied`: nothing. Changing to `denied` on a page where gtag.js runs sets
  Google's opt-out property `ga-disable-<id>` (the tag checks it before every
  hit and cookie write) and expires the `_ga*` cookies, without a reload.

The answer is changed in Settings > Data on this device
(`AnalyticsSetting`) or from the marketing footer's link, which reopens the
question (`reviewAnalyticsConsent()`). Another tab's change arrives through
the `storage` event.

A removal that reloads first raises a **write fence**
(`write-fence.ts`): until the page goes away, `setItem` for a key of the
removed category is dropped. Memory still holds the old state (a persisted
store writes it all on its next `set`, the bridge cache on the next event);
the fence keeps it from landing back on disk, without resetting stores that
would then, for instance, publish empty read cursors from their `pagehide`
flush.

The error panel's **Clear cache** (`clearAllClientCacheExceptSession()`,
`src/services/cache-clear.ts`) removes the categories the relays can rebuild
(`CACHE_CATEGORIES`: channels, profiles, readState, dms) and reloads; it
keeps the login, preferences and the device-only `personal` data.

`tests/services/local-data/inventory-guard.test.ts` reads the source and
fails when a storage key, a persisted store name or an IndexedDB database
is not in the inventory, so new storage cannot be added silently.

## 12. Manual verification

For each login method, clear localStorage then:

1. **NIP-07 extension**: log in → sidebar populates within ~2s; gear icon
   on owned channels visible on **first** paint, no refresh needed. Reload
   → sidebar paints instantly from cache before the relay round-trip
   completes.
2. **nsec**: paste a key with admin rights on a known channel → admin
   badge visible immediately. Reload → admin badge from cache, instant.
3. **Bunker URL**: paste `bunker://…@relay.nsec.app/?secret=…`, approve in
   the remote signer → channel list + admin status appear without refresh.
   Reload → bunker pre-warm fires; first AUTH challenge completes in <3s.
4. **Slow relay**: DevTools → Network → "Slow 3G"; repeat (1)–(3).
   Verify: channel-menu spinner is visible first; banner is a transparent
   placeholder until branding lands; chat pane shows "Loading channel
   info…" then "Loading messages…"; member panel shows "Loading members…".
   No empty-sidebar flash, no layout shift when the banner image arrives.
5. **Whitelist preflight on a restricted relay**: point a fresh nsec at
   `wss://lacrypta-relay.obelisk.ar` (or `public.obelisk.ar`); assert
   the relay-access banner shows `data-state="restricted"` ("Not
   whitelisted") within ~1.5s, with no 4s soak, and stays there instead of
   flickering back to "Authenticating…". With NIP-07, delay approving the
   AUTH popup past 1.5s: the verdict must still land right after you
   approve.
6. **Connection loss**: disconnect Wi-Fi mid-session;
   the connection banner appears within 1s. Reconnect: banner disappears.
7. **Settings > Data on this device**: remove "Messages and channel cache",
   confirm; reload; sidebar paints from a clean cache. Session and
   preferences preserved. "Remove everything" lands logged out with
   nothing under the origin in DevTools > Application.

## 13. Test coverage

| File | Covers |
|---|---|
| `tests/services/nostr-bridge/cache.test.ts` | round-trip, isolation by relay/kind, prefix-wipe deletion, JSON corruption resilience, kind 0 shape |
| `tests/services/cache-clear.test.ts` | the error panel's wipe: cache categories gone, login, preferences and device-only data kept, idempotent |
| `tests/services/local-data/*.test.ts` | the inventory guard, one owner per key, each category removes exactly its keys, remove everything, the write fence |
| `tests/services/nostr-bridge/session/connection.test.ts` (`session/fanout`) | P0 opens at once, P2 on the next microtask, then the per-group REQs, active channel first |
| `tests/services/nostr-bridge/preflight.test.ts` | preflight REQ fires, CLOSED restricted/auth-required flips access within ~50ms, EOSE flips to 'ok', no retry on maxAttempts=1 |
| `tests/services/nostr-bridge/bridge.test.ts` and the `bridge-*.test.ts` suites (groups, messages, message cache, mentions, lists, profiles, relay access, voice) | end-to-end ingest/subscribe behavior on the pool-level fake; deferred soak still holds for non-preflight subs |
| `tests/services/nostr-bridge/login-race.test.ts` | Fix A (`isLoggedIn` flips after `connect`), Fix B (eager admin/member sub on group discovery), Fix C (bunker pre-warm), Fix D (admin list persisted through `cacheSet`) |
| `tests/services/nostr-bridge/optimistic-send.test.ts` | local echo + relay-confirmed reconciliation |
| `tests/services/nostr-bridge/relay-auth-state.test.ts` | relay-access state transitions, sticky-OK, deferred soak |

Playwright E2E coverage of paint order, transparent banner, members
loading, whitelist rejection, connection loss, cache reuse, and clear-cache
lives under `scripts/e2e/`. See [§14](#14-playwright-e2e).

## 14. Playwright E2E

Specs run via `npm run test:e2e` against a local dev server (the harness
defaults to `localhost:3001`, matching `ecosystem.config.js`; `npm run
dev` serves `:3000`, so set `OBELISK_E2E_BASE_URL` or run dev with
`PORT=3001`; see `scripts/e2e/README.md` for the full port story)
talking to real relays.

| Spec | What it asserts | Relay |
|---|---|---|
| `login-and-send.spec.ts` | smoke: login → find channel → publish | `wss://public.obelisk.ar` |
| `paint-order.spec.ts` | channel-menu spinner → channel rows → chat spinner → chat content | `wss://public.obelisk.ar` |
| `transparent-banner.spec.ts` | `lc-banner-placeholder` before branding, image after | `wss://public.obelisk.ar` |
| `members-loading.spec.ts` | "Loading members…" until 39002 ingest | `wss://public.obelisk.ar` |
| `whitelist-rejection.spec.ts` | preflight surfaces `RelayAccessBanner[data-state="restricted"]` within ~3s | `wss://lacrypta-relay.obelisk.ar` (restricted; configurable via `OBELISK_E2E_RESTRICTED_RELAY`) |
| `connection-loss.spec.ts` | banner appears on socket drop, disappears on recovery | `wss://public.obelisk.ar` |
| `cache-second-load.spec.ts` | reload paints first channel row within 1500ms of `navigationStart` | `wss://public.obelisk.ar` |
| `clear-cache.spec.ts` | Settings > Data on this device removes one category and keeps the rest | `wss://public.obelisk.ar` |
| `read-state-convergence.spec.ts` | two contexts, same nsec → cursor converges within 12s | `wss://public.obelisk.ar` |

Per-spec retries: 1. Each spec uses `attachClientCapture` (see
`scripts/e2e/lib.ts`) to dump WebSocket frames on failure for debugging.
