# Notifications & read state

> Per-channel and per-DM cursors, mention/reply detection, mention
> navigation, and encrypted multi-device sync over NIP-59 gift-wrapped
> events. Same on mobile and desktop. Local-first; the relay sync ships
> on by default for logged-in users.

## What problem this solves

Before this redesign, read state was a clean local-first foundation but
had six gaps:

1. **No per-relay scope** — the same account hitting two relays shared
   one cursor map; there was no "this relay's read positions vs that
   relay's."
2. **No multi-device sync** — the prior read-state doc sketched a
   Phase 2 relay sync but it never shipped.
3. **No reply-to-me detection** — `replyToId` was parsed at ingest
   (`client.ts:ingestMessage`) but never surfaced as a notification;
   only explicit `@npub` mentions triggered inbox events.
4. **No mention navigation** — when a channel had multiple unread
   mentions, the user had to hand-scroll to find each one.
5. **No desktop badges** — mobile `PhoneShell.tsx` showed a
   `mention-pill` and unread count per channel; desktop `GroupNode`
   rendered nothing. The relay rail showed nothing on either platform.
6. **No path to OS-level notifications** — browser Notifications API
   + PWA + a Discord-style chime are wanted next, after the data
   layer is right.

## Architecture at a glance

```
            ┌─────────────────────────────┐
            │ bridge messagesByGroup,     │
            │ dmsByPeer, inboxEvents      │ (source of truth, in-memory)
            └────────────┬────────────────┘
                         │
            ┌────────────▼────────────────┐    ┌──────────────────────────┐
            │ pure derived selectors      │◀───│ useReadStateStore        │
            │ useChannelHighlights        │    │ groupCursors, dmCursors, │
            │ useChannelUnreadCount       │    │ inboxLastReadAt          │
            │ useHasAnyHighlights         │    │ (persisted localStorage) │
            └────────────┬────────────────┘    └────────────▲─────────────┘
                         │                                  │
       ┌─────────────────┴────────────────┐                 │
       │                                   │                 │
   ┌───▼────────────┐               ┌──────▼─────┐    ┌──────┴──────────┐
   │ ServerRail @   │               │ Channel row│    │ useAutoMarkRead │
   │ overlay        │               │ badges     │    │ + ReadStateRoot │
   │ MentionNav     │               │            │    │                 │
   └────────────────┘               └────────────┘    └────────▲────────┘
                                                              │
                                              ┌───────────────┴──────┐
                                              │ relay-sync engine    │
                                              │ NIP-59 gift wrap I/O │
                                              └──────────────────────┘
```

Five pieces:

1. **One persisted store** — `src/store/read-state.ts`. Cursors only.
2. **Pure derived selectors** — `src/lib/read-state/selectors.ts`.
   Counts and highlights.
3. **Mention/reply detection** — `src/lib/mentions.ts` for content +
   `#p` tags; `src/lib/read-state/replies.ts` for NIP-10 strict
   reply-to-me.
4. **Auto-mark hook** — `src/hooks/useAutoMarkRead.ts`. Cursor advance.
5. **Relay-sync engine** — `src/lib/read-state/relay-sync.ts`. Encrypted
   multi-device convergence.

## Cursor model

`src/store/read-state.ts`:

```ts
interface ReadStateStore {
  dmCursors: Record<peerHex, tsMs>;      // unix ms; only advances
  groupCursors: Record<groupId, tsMs>;   // unix ms; only advances
  inboxLastReadAt: number;               // unix ms; "everything older is read"
  inboxEvents: InboxEvent[];             // ring buffer, cap 50, newest first
  // ...
  applyRemoteState(remote: RemoteReadState): void; // monotonic merge
}
```

**Single cursor per channel/peer** — Discord-style. Mentions and
replies are derived views of unread messages, not separate cursors.
When the auto-mark hook advances `lastReadAt`, all three badges
(unread count, mention bubble, reply bubble) clear together.

**Monotonicity** — `setDmCursor` / `setGroupCursor` /
`applyRemoteState` only ever advance forward. Cursors are a CRDT
under `max()`: two devices (or two tabs) can advance independently
and converge by taking the larger value per key.

**Bootstrap fallback** — first paint with no cursor for a key falls
back to `Date.now() − 24h`. Matches the legacy heuristic; converges
to a real cursor as soon as the user opens the conversation.

## Detection

### Mentions

`extractMentionPubkeysFromMessage(content, tags)` in
`src/lib/mentions.ts:175` unions:

- Content tokens: `nostr:npub1<hex>` and `nostr:npub1<bech32>` and
  bare `npub1<bech32>`. Both legacy hex and real NIP-19 bech32 work.
- `["p", <64 hex>]` event tags (NIP-29 messages routinely carry
  these; some clients tag without a content token).

The bridge precomputes the mention list once at ingest
(`client.ts:ingestMessage`) and stores it on `JsMessage.mentions`. UI
selectors filter that list — no re-parsing per render.

### Replies

`isReplyToMe(msg, authorById, myPubkey)` in
`src/lib/read-state/replies.ts`. Strict NIP-10:

- Message must have an `e` tag with marker `"reply"` (already parsed
  into `JsMessage.replyToId` by the bridge).
- The id resolved to a parent must exist in the local channel
  message list AND have `pubkey === myPubkey`.

Root-only e-tags (`marker === "root"` or unmarked positional) are
**not** replies — those denote thread membership, which would
over-count for everyone in a threaded channel.

The inbox push site at `client.ts:ingestMessage` fires a `'reply'`
`InboxEvent` when a message is reply-to-me; mentions take precedence
over replies in the card type when both apply.

## Highlights selector

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
currently-loaded channel has unread mentions or replies — drives the
ServerRail relay-tile `@` overlay on the active relay.

## UI surfaces

| Surface | File | Behaviour |
|---|---|---|
| Relay-tile `@` overlay | `src/app/app/ServerRail.tsx` (RelayTile) | Tiny green `@` badge when the active relay has unread mentions or replies in any channel. Cross-relay surveillance is a follow-up; see "Limitations" below. |
| Channel row badges | desktop `DesktopShell.tsx` (GroupNode), mobile `PhoneShell.tsx` (channel list) | Gray unread count + green pill for `mentions + replies`. Bold name when unread > 0. |
| MentionNavigator | `src/components/chat/MentionNavigator.tsx` | Floating bottom-right of the message viewport. `↑ N / total ↓` when there are highlights; `F7` / `Shift+F7` keyboard shortcuts. Plus a `⌄` jump-to-latest button when the user is scrolled away from the bottom. |
| Inbox bell | existing — `useReadStateStore.inboxEvents` | Ring buffer of recent mention/reply/dm cards. `inboxLastReadAt` syncs across devices via the DM-state event. |
| Tab title + favicon | `src/hooks/useFaviconBadge.ts` | Sums `useTotalDMUnread` + `useTotalChannelUnread`; subtracts the active channel's contribution while watching. |

## Encrypted multi-device sync

Two scopes share the same engine
(`src/lib/read-state/relay-sync.ts`):

| Scope | Where it's published | Inner d-tag | Contents |
|---|---|---|---|
| **Groups state** | The single relay whose groups it tracks | `obelisk:readstate:v1` | `{ v:1, groups: { [groupId]: { lastReadAt } } }` |
| **DM state** | User's NIP-65 read+write union (`fetchMyDmRelays`) | `obelisk:dm-readstate:v1` | `{ v:1, dms: { [peerHex]: { lastReadAt } }, inboxLastReadAt }` |

### Why NIP-59 gift wrap

The relay sees only `kind:1059 from random pubkey #p=me` — the same
shape as a NIP-17 DM. There is no plaintext `d` tag, no app
fingerprint, no replaceable-event slot announcing "this user has
Obelisk read state on this relay."

Compared to a "kind 30078 + NIP-44 self-encrypted content" approach:

- The d-tag would be plaintext on the wire — anyone querying the
  relay with `kinds:[30078]` and `#d:["obelisk:readstate:v1"]` could
  enumerate every Obelisk user storing state there.
- Replaceable events MUST be signed by your real pubkey for the slot
  semantics. Combined with a known d-tag, that fingerprints "Alice
  uses Obelisk" to her primary read/write relays — especially
  problematic for the DM-scope event, which we publish to NIP-65
  relays.
- With gift wrap there is no app attribution. Plausible deniability
  for app usage on any single relay.

### Cost: accumulation

NIP-59 gift wraps aren't replaceable — every cursor advance creates
a new event on the relay. Mitigated by a **60-second debounce** —
bursts of cursor advances during active reading collapse into one
publish. At ~50 wraps/day for an active user, this is well within
relay limits and matches NIP-17 DM volume.

Newest-wins on read; old wraps stay on the relay but never affect
correctness. We deliberately do NOT publish NIP-09 deletions for
prior wraps — many relays don't honor them anyway, and the cleanup
is best-effort. The relay's storage budget is the relay's problem.

### Read protocol

For each target relay, subscribe `{kinds:[1059], "#p":[myPubkey]}`,
then for each event:

1. `unwrapForSelf(wrap, signer)` — NIP-44 decrypt the wrap content
   to recover the seal (kind 13), verify `seal.pubkey === me`,
   NIP-44 decrypt the seal to recover the rumor.
2. Filter by `rumor.kind === 30078` AND inner d-tag matches the
   scope's tag.
3. Parse `JSON.parse(rumor.content)`; reject when `v !== 1`.
4. Pick newest by inner `rumor.created_at`. The wrap's
   `created_at` is randomized ±2 days for privacy
   (NIP-59 §Privacy tags) — don't use it for ordering.
5. `useReadStateStore.applyRemoteState({...})` — atomic monotonic
   merge: each cursor takes `max(local, remote)`.

A bridgeCache snapshot is painted first for instant first-paint on
reload; the live REQ overwrites it as soon as the relay confirms.

### Write protocol

The engine subscribes to `useReadStateStore` cursor changes filtered
to its scope. On any change:

1. Schedule a `setTimeout(flush, 60_000)`; cancel any prior pending
   timer.
2. `flush()` builds the JSON payload from current cursors, calls
   `wrapForSelf({ kind: 30078, tags: [['d', dTag]], content }, signer)`,
   and `bridge.publishEvent(wrap, { extraRelays: [...], mode: 'replace' })`
   so the publish targets ONLY the scoped relays — no leakage to
   other relays the user happens to be on.
3. Cache the freshly-published payload to `bridgeCache` so reload
   paints the latest state without waiting for the relay round trip.

### NIP-44 + signing

`wrapForSelf` and `unwrapForSelf` (`src/lib/nip-59.ts`) accept a
`NipSigner` interface — `signEvent` + `nip44Encrypt` +
`nip44Decrypt`. The bridge builds one for the active session via
`getNipSigner()` (`client.ts`), which routes:

- nsec → `finalizeEvent(template, sk)` + raw `nostr-tools/nip44`
- NIP-07 → `window.nostr.signEvent` + `window.nostr.nip44.{encrypt,decrypt}`
- bunker → `BunkerSigner.signEvent` + `BunkerSigner.nip44{Encrypt,Decrypt}`

The wrap layer always uses a fresh ephemeral keypair (raw nip44),
so the user's real pubkey never appears on the kind 1059 envelope.

## Mount points

```
src/app/app/AppGate.tsx
└── <ReadStateRoot/>  (gated on useIsLoggedIn)
    ├── ensureReadStateStoreForAccount(myPubkey)   // localStorage isolation
    ├── ensureDMStoreForAccount(myPubkey)
    ├── ensureForumFollowForAccount(myPubkey)
    ├── for each configured relay: startGroupsRelaySync(relay, groupIds)
    ├── fetchMyDmRelays(...) → startDMRelaySync(relays)
    ├── useAutoMarkRead()
    └── useFaviconBadge()
```

## LocalStorage conventions

Unchanged from the previous read-state design (in `CLAUDE.md`):

| Data type | Key pattern | Mechanism |
|---|---|---|
| Per-user state (cursors, inbox events) | `obelisk-read-state:{myPubkey}` | Zustand `persist` + `ensureReadStateStoreForAccount` |
| Relay-derived metadata + state-event cache | `obelisk-cache-v3/{relay}/1059/{dTag}` | `bridgeCache` |
| UI-only flags | `obelisk-dex/{namespace}/{id}` | direct `localStorage` |

## Cross-tab sync

Two tabs on the same account converge automatically:

- Zustand `persist` writes to localStorage on every state change;
  other tabs receive a `storage` event and rehydrate.
- Cursors are monotonic, so the `max()` merge is conflict-free.

## Limitations

1. **Cross-relay mention surveillance** — relay-tile `@` overlay only
   lights up on the **active** relay. To show it on inactive relays
   we'd need to subscribe to `{kinds:[9], "#p":[me]}` on each
   configured relay even when the user isn't on them. Tracked as a
   follow-up; the data path is otherwise ready.
2. **Reply-to-me requires the parent in local state** — backfill that
   arrives before the parent does won't trigger a reply notification.
   Acceptable in practice because messages stream in chronologically;
   the gap is small.
3. **Gift wrap accumulation** — handled by debouncing, but
   long-running users on a single relay will accumulate ~10-30 KB of
   stale wraps per month. Future cleanup pass (kind 5 deletions) is
   tracked as a follow-up.

## Phase 1.5 (next): Browser & PWA notifications + sound

Once the data layer is stable in production, OS-level notifications
get layered on top. Same predicate as the inbox push at
`client.ts:ingestMessage`:

```
isNew && !isUserWatching(channel|dm) && (mentioned || replyToMe || isDM)
```

When that fires AND the user has opted in:

- `Notification` API for desktop / open-tab PWA delivery
- `<audio>` chime, debounced to once per second
- `notificationclick` handler (registered by a tiny SW) deep-links
  to the right channel/DM

iOS PWA: feature-detect `Notification` and gate the toggle. Sound
works everywhere.

No backend, no Web Push subscriptions — the relay sub stays in-page
and the browser owns the OS handoff.

## Testing

| File | Covers |
|---|---|
| `src/store/read-state.test.ts` | monotonicity, inbox cap/dedup, account-swap persist key, `applyRemoteState` merge semantics |
| `src/lib/read-state/selectors.test.ts` | unread counts, own-message exclusion, `computeChannelHighlights` ordering, mention + reply union |
| `src/lib/read-state/replies.test.ts` | NIP-10 strict reply detection, parent lookup, edge cases |
| `src/lib/read-state/relay-sync.test.ts` | sub/ingest with merged cursors, debounced publish, d-tag filtering, cache-first paint |
| `src/lib/nip-59.test.ts` | wrap/unwrap roundtrip, null-on-junk, recipient mismatch, ephemeral pubkey privacy |
| `src/lib/mentions.test.ts` | content-only and `#p`-tag mention extraction |
| `src/components/chat/MentionNavigator.test.tsx` | ↑↓ clamping, F7 / Shift+F7 keys, scrollIntoView, hidden when no highlights |
| `src/hooks/useAutoMarkRead.test.tsx` | cursor advances on watching, halts on hidden, monotonic on backfill |
| `src/hooks/useFaviconBadge.test.tsx` | tab title + favicon reflect derived totals, react to cursor advance |

End-to-end manual:

1. Open a channel with unread messages → desktop GroupNode shows gray
   unread count. @-mention yourself from another client → green
   bubble appears, `@` icon on the relay tile. Reply to one of your
   own messages → bubble count increments.
2. Click `↑↓` → scrolls to the highlighted message with a green ring
   flash. Click jump-to-latest → snaps to bottom + cursor advances →
   all badges clear.
3. Switch to a second configured relay → cursors restore from that
   relay's gift-wrapped state event (or empty if first time); badges
   scoped to that relay's groups only.
4. Log in same key in a second browser → after ≤60s of activity in
   browser A, browser B's cursor map updates (badges clear in B).
5. Send/read a DM → ≤60s later, the DM cursor + `inboxLastReadAt`
   propagate to all the user's NIP-65 relays.
6. Spot-check the relay with a debugger → only `kind:1059` events
   visible; no plaintext app fingerprint.
