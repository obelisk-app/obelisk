# Read state & notifications

Per-channel and per-DM cursors, mention/reply detection, mention
navigation, and encrypted multi-device sync over NIP-59 gift-wrapped
events. Same code path on mobile and desktop. Local-first; the relay
sync ships on by default for logged-in users.

This doc supersedes the legacy `notifications.md`. Read this together
with [`data-system.md`](data-system.md) which covers the parallel
data-loading tiers (P0 / P2).

## 1. Architecture in one paragraph

The bridge's `messagesByGroup` and `dmsByPeer` are the source of truth
for message data; `useNotificationsStore` holds the notification card
logs. Pure selectors derive unread counts and highlights from the
persisted cursor stores. An auto-mark hook advances
cursors when the user is watching a channel/DM. A relay-sync engine
publishes cursor snapshots in one-minute batches (a replaceable
`kind:30078` for groups scope, a NIP-59 gift wrap for DM scope) and
subscribes on each device so cursors converge via monotonic `max()` merge.

```
            ┌─────────────────────────────┐
            │ bridge: messagesByGroup,    │
            │ dmsByPeer                   │ (source of truth, in-memory)
            └────────────┬────────────────┘
                         │
            ┌────────────▼────────────────┐    ┌──────────────────────────┐
            │ pure derived selectors      │◀───│ useReadStateStore        │
            │ useChannelHighlights        │    │ groupCursors, dmCursors, │
            │ useChannelUnreadCount       │    │ inboxLastReadAt          │
            │ useHasAnyHighlights         │    │ (persisted localStorage) │
            └────────────┬────────────────┘    └──────────▲──────────────┘
                         │                                │
       ┌─────────────────┴────────────────┐               │
       │                                  │               │
   ┌───▼────────────┐               ┌─────▼──────┐    ┌───┴──────────────┐
   │ ServerRail @   │               │ Channel row│    │ useAutoMarkRead  │
   │ overlay        │               │ badges     │    │ + ReadStateRoot  │
   │ MentionNav     │               │            │    │                  │
   └────────────────┘               └────────────┘    └──────────▲───────┘
                                                                 │
                                              ┌──────────────────┴───┐
                                              │ relay-sync engine    │
                                              │ NIP-59 gift wrap I/O │
                                              └──────────────────────┘
```

## 2. Cursor model

`src/store/read-state/index.ts`:

```ts
interface ReadStateStore {
  dmCursors: Record<peerHex, tsMs>;      // unix ms; only advances
  groupCursors: Record<groupId, tsMs>;   // unix ms; only advances
  inboxLastReadAt: number;               // DM-notification cursor, unix ms
  // ...
  applyRemoteState(remote: RemoteReadState): void;
}
```

- **Single cursor per channel/peer**: Discord-style. Mentions and replies
  are derived views of unread messages, not separate cursors. The
  auto-mark hook advances `lastReadAt`; all three badges (unread count,
  mention bubble, reply bubble) clear together.
- **Monotonicity**: `setDmCursor` / `setGroupCursor` / `applyRemoteState`
  only ever advance forward. Cursors are a CRDT under `max()`: two
  devices (or two tabs) advance independently and converge by taking the
  larger value per key.
- **Bootstrap fallback**: first paint with no cursor for a key falls
  back to `Date.now() − 24h`. Matches the legacy heuristic; converges to
  a real cursor as soon as the user opens the conversation.
- **Multi-account isolation**: persist key `obelisk-read-state:{myPubkey}`
  via `ensureReadStateStoreForAccount`. Mounted from
  `ReadStateRoot` on every login change.

### 2b. Notification streams (`src/store/notifications/index.ts`)

Notifications are **two independent streams that never share a cursor**.
Conflating them was the original bug: one `inboxEvents` ring buffer and
one `inboxLastReadAt` meant reading your DMs silently marked every
channel mention read.

| Stream | Log | Cursor | Scope | Synced by |
|---|---|---|---|---|
| Mentions | `mentionsByRelay[relay]` (cap 50/relay) | `mentionCursorByRelay[relay]` | **Per relay** | groups-scope wrap (`mentionsReadAt`) |
| DMs | `dmNotifications` (cap 50) | `useReadStateStore.inboxLastReadAt` | Account-wide | DM-scope wrap (existing field) |

Rules:

- **`@you` and replies-to-you ping; ordinary traffic does not.**
  `classifyGroupPing` (`src/services/notifications/classify.ts`) returns
  `'reply'` when the NIP-10 `reply` parent is ours (resolved from the local
  message list, or from the `p` tag when the parent isn't loaded) and
  `'mention'` when we're in `mentions`. The card carries that `reason`;
  cards persisted before it existed read as `'mention'`.
- **Where pings are heard.**
  - Active relay: the per-channel kind-9 ingest, plus one live relay-wide
    `{kinds:[9], since: now}` REQ (`subscribeLivePings`). Only the active
    channel and ≤8 others get a per-channel stream, so without the live REQ
    a mention in any other channel never arrived. `ingestPing` skips
    channels that have their own stream.
  - The **background relay watch** (`src/services/nostr-bridge/relay/background-watch.ts`)
    on the 3 most-recently-used *other* relays, on a separate pool: a
    `#p:[me]` REQ from the relay's mention cursor (catch-up while the app
    was closed; needs the sender to p-tag, which Obelisk does per NIP-27)
    and a live relay-wide kind-9 REQ from now (catches un-tagged mentions).
    Both pass `onauth`: a whitelist relay CLOSEs the first REQ on a fresh
    socket with `auth-required:`, and nostr-tools re-issues it only when
    `onauth` is given. Without it the watch silently heard nothing.
  - Each card is stamped with its relay; background relays' unread counts
    badge their rail tiles, and the bell only shows the active relay's.
- **Sound and OS popups.** A card that was actually added (the push
  actions return `true`) is handed to `announceIncoming`
  (`src/services/notifications/alert.ts`): a chime per kind (`sound.ts`) and,
  when the page is hidden/unfocused and `preferences.desktopNotifications`
  is on, a `Notification`. Only events < 2 minutes old alert, once per event
  id, and chimes are throttled to one per 1.2s so a reconnect burst is one
  sound. DM popups show the sender only, never plaintext.
- **Cards persist per relay.** Leaving a relay and coming back restores
  its mention cards with their unread state intact.
- **First connect to an unseen relay ignores history.** `registerRelay`
  stamps `Date.now()` as that relay's cursor the first time the bridge
  connects to it, called from `finalizeLogin`, `switchRelay` **and the
  page-reload restore in `initialize()`** (which does not go through
  `finalizeLogin`), all *before* subscriptions open. Missing it on the
  reload path turned every historical mention into an unread card that
  could never be seen. A relay whose cursor already exists keeps
  it, so a reconnect never silences cards the user hasn't read.
- **A mention clears only when it has actually been seen**, or the bell
  is dismissed (relay mention cursor). `isMentionRead(m, relayCursor)` is
  `m.seen || m.createdAt <= relayCursor`; the channel cursor is deliberately
  NOT consulted, because it jumps to the newest message the moment a
  channel opens at the bottom and used to clear mentions the user never
  laid eyes on. `useMentionSeen` (`src/hooks/read-state/useMentionSeen.ts`, mounted in
  `ReadStateRoot`) sets `seen` once the `[data-msg-id]` row is ≥60% visible
  (IntersectionObserver, so scroll-container clipping counts) for 1s with
  the tab visible and focused. A mention in the channel you're watching
  still gets a card (no chime); the observer clears it once it's really on
  screen. `seen` is per device; only the relay mention cursor syncs.
- **Per-channel preferences** (`src/store/chat/channel-prefs.ts`, set from the
  channel right-click / long-press menu, `ChannelContextMenu.tsx`), keyed
  `relay|channelId`, persisted per account. Applied in one place, the
  bridge's `deliverGroupPing`:
  - *Notification settings* `nothing` → no card, no sound; `all` → ordinary
    messages chime too (no card); `mentions` (default).
  - *Mute* (15 min … forever) → cards and badges kept, no sound or popup.
  - *Stop following* → no unread count, dimmed row, no `all` pings, but
    @mentions and replies still card and chime.
  - *Mark as read* → channel cursor to now + every card for the channel
    marked seen. The escape hatch for any card the seen-detection can't
    reach.
- **Channel rows read the cards too.** The row's `@` pill is
  `max(loaded-message highlights, unread cards for that channel)`
  (`useUnreadMentionCardsForChannel`). Right after a relay switch the
  message store is empty and most channels never get a live stream, so a
  row built from loaded messages alone showed nothing for a mention the
  rail tile had just badged.

The DM cursor deliberately stays in the read-state store: it is already
the wire field in the DM-scope gift wrap, so multi-device convergence
works untouched. One source of truth per value, two stores.

## 3. Mention detection

`extractMentionPubkeysFromMessage(content, tags)` (`src/utils/message-text/mentions.ts`)
unions:

- Content tokens: `nostr:npub1<hex>` and `nostr:npub1<bech32>` and bare
  `npub1<bech32>`. Both legacy hex and real NIP-19 bech32 work.
- `["p", <64 hex>]` event tags (NIP-29 messages routinely carry these).

Precomputed once at ingest (`client.ts:ingestMessage`) and stored on
`JsMessage.mentions`. UI selectors filter that list; no re-parsing per
render.

## 4. Reply detection

`isReplyToMe(msg, authorById, myPubkey)` (`src/services/read-state/replies.ts`),
strict NIP-10:

- Message must have an `e` tag with marker `"reply"` (parsed by the
  bridge into `JsMessage.replyToId`).
- The id resolved to a parent must exist in the local channel message
  list AND have `pubkey === myPubkey`.

Root-only e-tags (`marker === "root"` or unmarked positional) are NOT
replies; those denote thread membership.

Replies feed the **channel highlight** views (the `↑↓` MentionNavigator
and the green channel-row pill) and, since the notification-sounds work,
also produce a notification card with `reason: 'reply'`. See §2b.

## 5. Highlights selector

`useChannelHighlights(groupId, myPubkey): ChannelHighlights`:

```ts
interface ChannelHighlights {
  unread: number;
  mentions: number;
  replies: number;
  /** mention OR reply event ids, oldest→newest, for ↑↓ navigation. */
  eventIds: ReadonlyArray<string>;
}
```

`useHasAnyHighlights(myPubkey)` returns `true` when any
currently-loaded channel has unread mentions or replies, drives the
ServerRail relay-tile `@` overlay on the active relay.

## 6. UI surfaces

| Surface | File | Behaviour |
|---|---|---|
| Relay-tile `@` overlay | `src/app/[locale]/app/rail/ServerRail.tsx` (RelayTile) | Tiny green `@` badge when the active relay has unread mentions or replies in any channel. Cross-relay surveillance is a follow-up. |
| Channel row badges | desktop `DesktopShell.tsx` (`GroupNode`), mobile `PhoneShell.tsx` (channel list) | Gray unread count + green pill for `mentions + replies`. Bold name when unread > 0. |
| MentionNavigator | `src/components/chat/mentions/MentionNavigator.tsx` | Floating bottom-right of the message viewport. `↑ N / total ↓` when there are highlights; `F7` / `Shift+F7` keyboard shortcuts. Plus a `⌄` jump-to-latest button when scrolled away from the bottom. |
| Inbox bell | desktop `DesktopShell.tsx` (`RelayTopBar`), mobile inbox tab | Two tabs: **Mentions** (active relay) and **DMs**, with independent counts, independent "mark read", and independent "clear". The bell glyph shows their sum. |
| Tab title + favicon | `src/hooks/notifications/useFaviconBadge.ts` | `useTotalDMUnread` + unread mentions on the active relay. Ordinary channel traffic does **not** badge the tab; a busy relay would otherwise pin it at `(99+)` forever. |

## 7. Encrypted multi-device sync

Two scopes share the same engine (`src/services/read-state/relay-sync.ts`):

| Scope | Where it's published | Inner d-tag | Contents |
|---|---|---|---|
| **Groups state** | The **active** relay only (`useCurrentRelayUrl`) | `obelisk:readstate:v1` | `{ v:1, groups: { [groupId]: { lastReadAt } }, mentionsReadAt? }` |
| **DM state** | User's NIP-65 read+write union (`fetchRelayList`) | `obelisk:dm-readstate:v1` | `{ v:1, dms: { [peerHex]: { lastReadAt } }, inboxLastReadAt }` |

The groups-scope sub used to fan out across `useConfiguredRelays()`:
every relay in the rail got a kind 1059 REQ. That was the source of the
"send AUTH on a closed connection" loop: a whitelist-gated relay (e.g.
`lacrypta-relay.obelisk.ar`) the user had in their rail but wasn't
browsing would issue NIP-42 AUTH, the bridge would auto-sign and send,
the relay would close the socket, and nostr-tools would resend on
reconnect. Switching to active-relay-only also satisfies the
[architectural rule in AGENTS.md](../../AGENTS.md#single-relay-rule-for-groups):
**only DMs run cross-relay**.

Per-relay group-id collisions are not an in-memory concern because
NIP-29 group ids are random hex blobs (effectively unique across
relays); the on-the-wire payload is always scoped per relay (each
gift wrap carries only `groupIdsForRelay`), and `bridgeCache` keys are
`${relay}|${kind}|${dTag}`.

### Two transports, and why

| Scope | Transport | Target |
|---|---|---|
| Groups | replaceable `kind:30078`, `d`-tagged, NIP-44 to self | the single relay owning those groups |
| DMs | NIP-59 gift wrap | the user's NIP-65 read+write relays |

A gift wrap conceals that a user runs this app on a given relay: the relay
sees only `kind:1059 from a random pubkey #p=me`, the same shape as a NIP-17
DM. No plaintext `d` tag, no app fingerprint, no replaceable slot announcing
"this user has Obelisk read state here."

That is worth paying for on **third-party** relays, which is why DM scope
still uses it. It is worth almost nothing on the **groups** relay: that relay
already authenticates the user over NIP-42 and already publishes their
membership as `kind:39002`. It learns nothing from a `d` tag it did not
already know, while the cost is charged in full.

### What the cost turned out to be

Gift wraps are not replaceable: every cursor advance creates a permanent
event. The original design offset that with a 60-second debounce. That window
was later cut to **8 seconds** to fix a real convergence bug (users read for
under a minute, then navigate away, and cleanup cleared the pending timer
before it fired), which made the accumulation 7.5× worse without the trade-off
being revisited.

Groups scope is now a replaceable event, so that cost is gone: **one event per
user per relay**, replaced in place.

### Two traps

**A gift wrap must be published through `publishSignedEvent`.** `publishEvent`
re-signs whatever template it is given. Passing it an already-signed wrap
replaces the throwaway author with the user's own key and leaves the payload
undecryptable, because the reader derives the NIP-44 conversation key from the
wrap's pubkey. This was live for both scopes: read-state sync did not converge,
and the wraps carried the very identity the wrap exists to hide.

**A gift wrap can never be deleted by its author.** `wrapForSelf` generates the
signing key inside the function and discards it; NIP-09 requires a deletion be
signed by the same pubkey. Nobody (not the user, not the app) can issue a
kind-5 for one. Bound the lifetime with NIP-40, or use a replaceable event.

### Migration

Groups scope publishes `30078` only, and reads **both** `30078` and legacy
wraps for one release so cursors written by an older client are not stranded.
Precedence is by inner timestamp, and the store merge is monotonic, so an
out-of-order arrival cannot roll a cursor backwards. Drop the legacy read path
once the fleet has turned over.

Existing wraps cannot be cleaned up by the client (see above); they age out
under the relay's own retention policy.

### Read protocol

**Groups scope** subscribes `{kinds:[30078], authors:[myPubkey], "#d":[tag]}`:
one event back, one NIP-44 decrypt of `content`, then step 3 onward below.
During the migration window it also runs the wrap path below.

**DM scope** subscribes `{kinds:[1059], "#p":[myPubkey]}`. This filter cannot
be narrowed (the wrap author is a throwaway key and `created_at` is fuzzed),
so it delivers every wrap addressed to the user, overwhelmingly real NIP-17
DMs, each costing two signer round-trips to open and discard. `wrap-ledger.ts`
exists to remember those verdicts across reloads. Before opening anything:
a wrap the encrypted DM store holds is a DM and is skipped (and recorded),
and while DMs are on and locked no unclassified wrap is opened at all: it
waits for the DM unlock, so a page load never asks the signer on its own
(see [direct-messages.md, Storage](../features/direct-messages.md#storage-the-encrypted-dm-store)).
For each event:

1. `unwrapForSelf(wrap, signer)`: NIP-44 decrypt the wrap content to
   recover the seal (kind 13), verify `seal.pubkey === me`, NIP-44
   decrypt the seal to recover the rumor.
2. Filter by `rumor.kind === 30078` AND inner d-tag matches the scope's
   tag.
3. Parse `JSON.parse(rumor.content)`; reject when `v !== 1`.
4. Pick newest by inner `rumor.created_at`. The wrap's `created_at` is
   randomized ±2 days for privacy (NIP-59 §Privacy tags).
5. `useReadStateStore.applyRemoteState({...})`, atomic monotonic
   merge: each cursor takes `max(local, remote)`.

A `bridgeCache` snapshot is painted first for instant first-paint on
reload; the live REQ overwrites it as soon as the relay confirms.

### Write protocol

The engine subscribes to `useReadStateStore` cursor changes filtered to
its scope. On any change:

1. Update and persist local cursors immediately, but only advance automatic cursors for incoming messages actually being viewed. Outgoing messages already do not count as unread and cannot advance the automatic cursor. Explicit “mark read” actions still work.
2. Start a fixed 60-second batching window for unsynced changes. New arrivals join that batch without resetting its deadline. Only one operation per account and scope may await signer approval, including across watcher remounts; subsequent writes wait at least 60 seconds after completion.
3. Publish the newest combined snapshot: groups use self-encrypted NIP-44 content in a signed, replaceable kind-30078 event on their relay; DMs use `wrapForSelf` and `publishSignedEvent` on the configured DM relays.
4. Persist monotonic acknowledged cursors, retry timing and failure count in `syncProgress` inside the account's existing read-state store (saved-shape version 2). Local cursors newer than those checkpoints are the pending payload. Startup checks for them even without a new message. Version-1 data keeps its cursors and starts with empty checkpoints; cached relay snapshots seed the checkpoints before scheduling.
5. A failed encryption, signing or publish attempt retains the pending cursors and backs off for 5, 10, 20, 40, then at most 60 minutes. New messages, refreshes and watcher remounts do not bypass that persisted backoff. Success resets it.

Hiding the page cancels the scheduled timer. Returning to the page schedules another batch. Page-hide and teardown never initiate signer requests; they rely on the already-persisted local cursors. An operation already awaiting approval may finish. Cross-device updates normally lag local reads by about a minute, plus signer and relay latency; a closed or hidden page waits until a later visible visit.

Remote snapshots acknowledge their cursors before merging them locally, so receiving remote state alone does not publish it back. Independent newer local cursors remain pending. Groups' own relay echoes use the existing account-cleared decryption memo seeded from the exact ciphertext just produced; known outgoing DM read-state wraps are recorded as inert for DM consumers and seen for read-state consumers before publication. Neither needs a second signer approval to discover the payload we just wrote.

These signer operations support cross-device unread synchronization. Local read tracking does not require encryption or signing. A remote signer can ask to encrypt an outgoing snapshot, decrypt an incoming snapshot from another device, and sign application data (kind 30078); these are separate from permission to decrypt DM contents.

### NIP-44 + signing

`wrapForSelf` and `unwrapForSelf` in `src/services/read-state/gift-wrap.ts` adapt the bridge's `NipSigner` (`src/types/nostr/nip-signer.ts`) to the SDK signer interface. `@nostr-wot/dm` owns self-addressed NIP-59 encryption, seal signature verification, rumor author/hash validation, and rejection of other authors in the mixed inbox. The bridge builds its signing capability for the active session via `getNipSigner()`:

- nsec → `finalizeEvent(template, sk)` + raw `nostr-tools/nip44`
- NIP-07 → `window.nostr.signEvent` + `window.nostr.nip44.{encrypt,decrypt}`
- bunker → `BunkerSigner.signEvent` + `BunkerSigner.nip44{Encrypt,Decrypt}`

The wrap layer uses a fresh ephemeral keypair, so the user's real
pubkey never appears on the kind 1059 envelope.

## 8. Priority tier alignment

The two scopes have different priorities now:

- **Groups scope** (active relay only): fires as soon as `myPubkey`,
  `activeRelay`, and at least one group are known. **No `useReadyToSync`
  gate.** It must land before messages paint, otherwise unread badges
  flash on then off when cursors arrive (the bridgeCache seed paints
  instantly; the live REQ overwrites). The store defaults are "from
  zero," so a relay that doesn't store our wrap (or doesn't accept kind
  1059) leaves cursors at zero and a fresh wrap is published the moment
  the user marks anything read.
- **DM scope** (NIP-65 read+write union): still gated by
  `useReadyToSync()` because it depends on the asynchronous `fetchRelayList`
  resolution and is one of two acceptable cross-relay fanouts (DMs
  themselves being the other).

`useReadyToSync()` waits for either `groupMetadataEose === true` (channel
menu painted) OR 1000ms post-`Connected` (some relays filter kind 39000
silently). Local cursor updates are immediate; the one-minute relay batch runs independently of this mount delay.

See [`data-system.md` §4](data-system.md) for the full priority table.

## 9. Mount points

```
src/app/[locale]/app/AppGate.tsx
└── <ReadStateRoot/>  (gated on useIsLoggedIn)
    │  src/components/read-state/ReadStateRoot.tsx
    └── useReadStateRuntime()  (src/hooks/read-state/)
        ├── ensureReadStateAccount(myPubkey)  (services/read-state/account-stores.ts)
        ├── armNotificationPermissionPrompt()
        ├── [no gate] startGroupsRelaySync(activeRelay, groupIds)
        ├── [useReadyToSync] startAccountDmSync(myPubkey, relays, activeRelay)
        │   └── NIP-65 lookup + startDMRelaySync, cancelled together on account/relay change
        ├── useAutoMarkRead()
        ├── useMentionSeen()
        └── useFaviconBadge()
```

## 10. LocalStorage conventions

| Data type | Key pattern | Mechanism |
|---|---|---|
| Per-user cursors | `obelisk-read-state:{myPubkey}` | Zustand `persist` + `ensureReadStateStoreForAccount` |
| Notification cards + mention cursors | `obelisk-notifications:{myPubkey}` | Zustand `persist` + `ensureNotificationsStoreForAccount` |
| Relay-derived metadata + state-event cache | `obelisk-cache-v4/{relay}/1059/{dTag}` | `bridgeCache` |
| UI-only flags | `obelisk-dex/{namespace}/{id}` | direct `localStorage` |

## 11. Cross-tab sync

Two tabs on the same account converge automatically:

- Zustand `persist` writes to localStorage on every state change; other
  tabs receive a `storage` event and rehydrate.
- Cursors are monotonic, so the `max()` merge is conflict-free.

## 12. Limitations

1. **Cross-relay mention surveillance**: the relay-tile `@` overlay only
   lights up on the active relay. To show it on inactive relays we'd
   need to subscribe to `{kinds:[9], "#p":[me]}` on each configured
   relay even when the user isn't on them. Tracked as a follow-up; the
   data path is otherwise ready.
2. **Reply-to-me requires the parent in local state**: backfill that
   arrives before the parent does won't count toward the channel's reply
   highlight. Acceptable because messages stream in chronologically.
   (Replies produce a `reason: 'reply'` card; see §2b.)
3. **Gift wrap accumulation**: DM snapshots remain non-replaceable. One-minute batches reduce their frequency but do not bound relay retention. Their ephemeral signing keys are discarded, so NIP-09 deletion is unavailable. Groups use replaceable snapshots and do not accumulate this way.

## 13. Browser notifications and sound

`src/services/notifications/alert.ts` and `sound.ts` handle browser notifications and throttled sounds after a notification card has passed the store’s deduplication and read-cursor checks. Freshness and event-id deduplication prevent backfilled messages from sounding new. Account preferences control browser notifications and sounds; browser permission and page visibility determine whether an OS notification is shown.

The active relay supplies group mentions; the background watcher supplies DMs. Alerts do not create a second global group scan. Notification clicks currently focus the existing page. Delivery through service-worker registrations and click-to-conversation navigation remain [roadmap work](../../ROADMAP.md#voice-and-notifications), including mobile browsers that reject the page-level `Notification` constructor. There is no backend Web Push service; relay subscriptions remain in the open page.

## 14. Testing

| File | Covers |
|---|---|
| `tests/store/read-state/read-state.test.ts` | cursor monotonicity, account-swap persist key, `applyRemoteState` merge semantics |
| `tests/store/notifications/notifications.test.ts` | stream independence, per-relay bucketing, first-connect floor, backfill drop, caps/dedup, remote cursor merge |
| `tests/services/nostr-bridge/bridge-mentions.test.ts` (`mention notifications`) | mentions-only ingest, relay stamping, self-mention and reply suppression, cursor-gated backfill |
| `tests/services/read-state/selectors.test.ts` | unread counts, own-message exclusion, `computeChannelHighlights` ordering, mention + reply union |
| `tests/services/read-state/replies.test.ts` | NIP-10 strict reply detection, parent lookup, edge cases |
| `tests/services/read-state/relay-sync.test.ts` | sub/ingest with merged cursors, batched publish, durable pending state and backoff, remote/own-echo suppression, d-tag filtering, cache-first paint |
| `tests/hooks/read-state/useReadyToSync.test.tsx` | `useReadyToSync` gate: false before connect, flips on EOSE, flips after 1000ms grace, no flip if connection drops mid-grace |
| `tests/services/read-state/gift-wrap.test.ts` | wrap/unwrap roundtrip, null-on-junk, recipient mismatch, ephemeral pubkey privacy |
| `tests/utils/message-text/mentions.test.ts` | content-only and `#p`-tag mention extraction |
| `tests/components/chat/mentions/MentionNavigator.test.tsx` | ↑↓ clamping, F7 / Shift+F7 keys, scrollIntoView, hidden when no highlights |
| `tests/hooks/read-state/useAutoMarkRead.test.tsx` | cursor advances on watching, halts on hidden, monotonic on backfill |
| `tests/hooks/notifications/useFaviconBadge.test.tsx` | tab title + favicon count DMs + active-relay mentions only, ignore ordinary traffic and other relays' mentions |

End-to-end (Playwright):

| Spec | What it asserts |
|---|---|
| `scripts/e2e/read-state-convergence.spec.ts` | Two contexts seeded with the same nsec on `public.obelisk.ar`. Context A advances a cursor; after a one-minute batch plus relay grace context B's `obelisk-read-state:<pubkey>.groupCursors[gid]` reflects the advance. |

### Decryption consent

Legacy group read-state migration receives the same gift-wrap envelopes as real DMs. It must not unwrap them while DMs are disabled, after logout, or before the DM store is unlocked. Disabled envelopes are ignored; enabled but locked envelopes wait for the explicit unlock. The group replaceable snapshot uses a separate self-decryption request for group read positions and does not decrypt DM envelopes.
