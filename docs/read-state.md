# Read state & notifications

Per-channel and per-DM cursors, mention/reply detection, mention
navigation, and encrypted multi-device sync over NIP-59 gift-wrapped
events. Same code path on mobile and desktop. Local-first; the relay
sync ships on by default for logged-in users.

This doc supersedes the legacy `notifications.md`. Read this together
with [`data-system.md`](./data-system.md) which covers the parallel
data-loading orchestrator.

## 1. Architecture in one paragraph

The bridge's `messagesByGroup`, `dmsByPeer`, and inbox-event ring buffer
are the source of truth. Pure selectors derive unread counts and
highlights from the persisted cursor store. An auto-mark hook advances
cursors when the user is watching a channel/DM. A relay-sync engine
wraps cursor snapshots in NIP-59 gift wraps and publishes them to the
right relays with an 8-second debounce; the same engine subscribes on
each device so cursors converge via monotonic `max()` merge.

```
            ┌─────────────────────────────┐
            │ bridge: messagesByGroup,    │
            │ dmsByPeer, inboxEvents      │ (source of truth, in-memory)
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

`src/store/read-state.ts`:

```ts
interface ReadStateStore {
  dmCursors: Record<peerHex, tsMs>;      // unix ms; only advances
  groupCursors: Record<groupId, tsMs>;   // unix ms; only advances
  inboxLastReadAt: number;               // unix ms; older = read
  inboxEvents: InboxEvent[];             // ring buffer, cap 50, newest first
  // ...
  applyRemoteState(remote: RemoteReadState): void;
}
```

- **Single cursor per channel/peer** — Discord-style. Mentions and replies
  are derived views of unread messages, not separate cursors. The
  auto-mark hook advances `lastReadAt`; all three badges (unread count,
  mention bubble, reply bubble) clear together.
- **Monotonicity** — `setDmCursor` / `setGroupCursor` / `applyRemoteState`
  only ever advance forward. Cursors are a CRDT under `max()`: two
  devices (or two tabs) advance independently and converge by taking the
  larger value per key.
- **Bootstrap fallback** — first paint with no cursor for a key falls
  back to `Date.now() − 24h`. Matches the legacy heuristic; converges to
  a real cursor as soon as the user opens the conversation.
- **Multi-account isolation** — persist key `obelisk-read-state:{myPubkey}`
  via `ensureReadStateStoreForAccount`. Mounted from
  `ReadStateRoot` on every login change.

## 3. Mention detection

`extractMentionPubkeysFromMessage(content, tags)` (`src/lib/mentions.ts`)
unions:

- Content tokens: `nostr:npub1<hex>` and `nostr:npub1<bech32>` and bare
  `npub1<bech32>`. Both legacy hex and real NIP-19 bech32 work.
- `["p", <64 hex>]` event tags (NIP-29 messages routinely carry these).

Precomputed once at ingest (`client.ts:ingestMessage`) and stored on
`JsMessage.mentions`. UI selectors filter that list — no re-parsing per
render.

## 4. Reply detection

`isReplyToMe(msg, authorById, myPubkey)` (`src/lib/read-state/replies.ts`)
— strict NIP-10:

- Message must have an `e` tag with marker `"reply"` (parsed by the
  bridge into `JsMessage.replyToId`).
- The id resolved to a parent must exist in the local channel message
  list AND have `pubkey === myPubkey`.

Root-only e-tags (`marker === "root"` or unmarked positional) are NOT
replies — those denote thread membership.

The inbox push site at `client.ts:ingestMessage` fires a `'reply'`
`InboxEvent` when a message is reply-to-me. Mentions take precedence
over replies in the card type when both apply.

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
currently-loaded channel has unread mentions or replies — drives the
ServerRail relay-tile `@` overlay on the active relay.

## 6. UI surfaces

| Surface | File | Behaviour |
|---|---|---|
| Relay-tile `@` overlay | `src/app/app/ServerRail.tsx` (RelayTile) | Tiny green `@` badge when the active relay has unread mentions or replies in any channel. Cross-relay surveillance is a follow-up. |
| Channel row badges | desktop `DesktopShell.tsx` (`GroupNode`), mobile `PhoneShell.tsx` (channel list) | Gray unread count + green pill for `mentions + replies`. Bold name when unread > 0. |
| MentionNavigator | `src/components/chat/MentionNavigator.tsx` | Floating bottom-right of the message viewport. `↑ N / total ↓` when there are highlights; `F7` / `Shift+F7` keyboard shortcuts. Plus a `⌄` jump-to-latest button when scrolled away from the bottom. |
| Inbox bell | desktop `DesktopShell.tsx`, mobile inbox tab | Ring buffer of recent mention/reply/dm cards. `inboxLastReadAt` syncs across devices via the DM-state event. |
| Tab title + favicon | `src/hooks/useFaviconBadge.ts` | Sums `useTotalDMUnread` + `useTotalChannelUnread`; subtracts the active channel's contribution while watching. |

## 7. Encrypted multi-device sync

Two scopes share the same engine (`src/lib/read-state/relay-sync.ts`):

| Scope | Where it's published | Inner d-tag | Contents |
|---|---|---|---|
| **Groups state** | Each configured relay | `obelisk:readstate:v1` | `{ v:1, groups: { [groupId]: { lastReadAt } } }` |
| **DM state** | User's NIP-65 read+write union (`fetchRelayList`) | `obelisk:dm-readstate:v1` | `{ v:1, dms: { [peerHex]: { lastReadAt } }, inboxLastReadAt }` |

### Why NIP-59 gift wrap

The relay sees only `kind:1059 from random pubkey #p=me` — the same
shape as a NIP-17 DM. There is no plaintext `d` tag, no app fingerprint,
no replaceable-event slot announcing "this user has Obelisk read state
on this relay." Plausible deniability for app usage on any single
relay.

### Cost: accumulation

NIP-59 gift wraps aren't replaceable — every cursor advance creates a
new event on the relay. Mitigated by an **8-second debounce** —
bursts of cursor advances during active reading collapse into one
publish. Newest-wins on read; old wraps stay on the relay but never
affect correctness. We deliberately do NOT publish NIP-09 deletions for
prior wraps — many relays don't honor them anyway.

### Read protocol

For each target relay, subscribe `{kinds:[1059], "#p":[myPubkey]}`,
then for each event:

1. `unwrapForSelf(wrap, signer)` — NIP-44 decrypt the wrap content to
   recover the seal (kind 13), verify `seal.pubkey === me`, NIP-44
   decrypt the seal to recover the rumor.
2. Filter by `rumor.kind === 30078` AND inner d-tag matches the scope's
   tag.
3. Parse `JSON.parse(rumor.content)`; reject when `v !== 1`.
4. Pick newest by inner `rumor.created_at`. The wrap's `created_at` is
   randomized ±2 days for privacy (NIP-59 §Privacy tags).
5. `useReadStateStore.applyRemoteState({...})` — atomic monotonic
   merge: each cursor takes `max(local, remote)`.

A `bridgeCache` snapshot is painted first for instant first-paint on
reload; the live REQ overwrites it as soon as the relay confirms.

### Write protocol

The engine subscribes to `useReadStateStore` cursor changes filtered to
its scope. On any change:

1. Schedule `setTimeout(flush, 8000)`; cancel any prior pending timer.
2. `flush()` builds the JSON payload, calls `wrapForSelf({ kind: 30078, tags: [['d', dTag]], content }, signer)`,
   and `bridge.publishEvent(wrap, { extraRelays: [...], mode: 'replace' })`
   so the publish targets ONLY the scoped relays.
3. Cache the freshly-published payload to `bridgeCache` so reload paints
   the latest state without waiting for the relay round trip.

### NIP-44 + signing

`wrapForSelf` and `unwrapForSelf` (`src/lib/nip-59.ts`) accept a
`NipSigner` — `signEvent` + `nip44Encrypt` + `nip44Decrypt`. The bridge
builds one for the active session via `getNipSigner()`:

- nsec → `finalizeEvent(template, sk)` + raw `nostr-tools/nip44`
- NIP-07 → `window.nostr.signEvent` + `window.nostr.nip44.{encrypt,decrypt}`
- bunker → `BunkerSigner.signEvent` + `BunkerSigner.nip44{Encrypt,Decrypt}`

The wrap layer uses a fresh ephemeral keypair, so the user's real
pubkey never appears on the kind 1059 envelope.

## 8. Priority orchestrator alignment

The relay-sync subscriptions are P2 — they MUST NOT block the
channel-menu paint. `useReadyToSync()` (in `src/lib/read-state/root.tsx`)
gates the two relay-sync `useEffect`s on either:

1. `groupMetadataEose === true` — the relay finished streaming kind
   39000; channels painted. OR
2. 1000ms post-`Connected` — even on a relay that silently filters kind
   39000 (no EOSE), don't defer cursor sync forever.

The 8s debounce in `flush()` means a ~1s mount delay is imperceptible.

See [`data-system.md` §4](./data-system.md) for the full priority table.

## 9. Mount points

```
src/app/app/AppGate.tsx
└── <ReadStateRoot/>  (gated on useIsLoggedIn)
    │  src/lib/read-state/root.tsx
    ├── ensureReadStateStoreForAccount(myPubkey)
    ├── ensureDMStoreForAccount(myPubkey)
    ├── ensureModerationStoreForAccount(myPubkey)
    ├── ensureForumFollowForAccount(myPubkey)
    ├── [gated by useReadyToSync] for each configured relay:
    │       startGroupsRelaySync(relay, groupIds)
    ├── fetchRelayList(...) → setDmRelays
    ├── [gated by useReadyToSync] startDMRelaySync(dmRelays)
    ├── useAutoMarkRead()
    └── useFaviconBadge()
```

## 10. LocalStorage conventions

| Data type | Key pattern | Mechanism |
|---|---|---|
| Per-user cursors + inbox events | `obelisk-read-state:{myPubkey}` | Zustand `persist` + `ensureReadStateStoreForAccount` |
| Relay-derived metadata + state-event cache | `obelisk-cache-v3/{relay}/1059/{dTag}` | `bridgeCache` |
| UI-only flags | `obelisk-dex/{namespace}/{id}` | direct `localStorage` |

## 11. Cross-tab sync

Two tabs on the same account converge automatically:

- Zustand `persist` writes to localStorage on every state change; other
  tabs receive a `storage` event and rehydrate.
- Cursors are monotonic, so the `max()` merge is conflict-free.

## 12. Limitations

1. **Cross-relay mention surveillance** — the relay-tile `@` overlay only
   lights up on the active relay. To show it on inactive relays we'd
   need to subscribe to `{kinds:[9], "#p":[me]}` on each configured
   relay even when the user isn't on them. Tracked as a follow-up; the
   data path is otherwise ready.
2. **Reply-to-me requires the parent in local state** — backfill that
   arrives before the parent does won't trigger a reply notification.
   Acceptable because messages stream in chronologically.
3. **Gift wrap accumulation** — handled by the 8-second debounce, but
   long-running users on a single relay will accumulate ~10-30 KB of
   stale wraps per month. Future cleanup pass (NIP-09 deletions) is a
   follow-up.

## 13. Phase 1.5 (next): browser + PWA notifications + sound

Once the data layer is stable in production, OS-level notifications get
layered on top. Same predicate as the inbox push at
`client.ts:ingestMessage`:

```
isNew && !isUserWatching(channel|dm) && (mentioned || replyToMe || isDM)
```

When that fires AND the user has opted in:

- `Notification` API for desktop / open-tab PWA delivery.
- `<audio>` chime, debounced to once per second.
- `notificationclick` handler (registered by a tiny SW) deep-links to
  the right channel/DM.

iOS PWA: feature-detect `Notification` and gate the toggle. Sound works
everywhere. No backend, no Web Push subscriptions — the relay sub stays
in-page and the browser owns the OS handoff.

## 14. Testing

| File | Covers |
|---|---|
| `src/store/read-state.test.ts` | monotonicity, inbox cap/dedup, account-swap persist key, `applyRemoteState` merge semantics |
| `src/lib/read-state/selectors.test.ts` | unread counts, own-message exclusion, `computeChannelHighlights` ordering, mention + reply union |
| `src/lib/read-state/replies.test.ts` | NIP-10 strict reply detection, parent lookup, edge cases |
| `src/lib/read-state/relay-sync.test.ts` | sub/ingest with merged cursors, debounced publish, d-tag filtering, cache-first paint |
| `src/lib/read-state/root.test.tsx` | `useReadyToSync` gate: false before connect, flips on EOSE, flips after 1000ms grace, no flip if connection drops mid-grace |
| `src/lib/nip-59.test.ts` | wrap/unwrap roundtrip, null-on-junk, recipient mismatch, ephemeral pubkey privacy |
| `src/lib/mentions.test.ts` | content-only and `#p`-tag mention extraction |
| `src/components/chat/MentionNavigator.test.tsx` | ↑↓ clamping, F7 / Shift+F7 keys, scrollIntoView, hidden when no highlights |
| `src/hooks/useAutoMarkRead.test.tsx` | cursor advances on watching, halts on hidden, monotonic on backfill |
| `src/hooks/useFaviconBadge.test.tsx` | tab title + favicon reflect derived totals, react to cursor advance |

End-to-end (Playwright):

| Spec | What it asserts |
|---|---|
| `scripts/e2e/read-state-convergence.spec.ts` | Two contexts seeded with the same nsec on `public.obelisk.ar`. Context A advances a cursor; within 12s (8s debounce + grace) context B's `obelisk-read-state:<pubkey>.groupCursors[gid]` reflects the advance. |
