# Read state & notifications

> The store, selectors, hooks, and storage convention behind unread badges.
> Same on mobile and desktop. Local-first; optional encrypted relay sync as
> a deferred Phase 2.

## What problem this solves

Before this system, unread state lived in three half-finished layers and
nothing kept them in sync:

| Layer | What it was | Status |
|---|---|---|
| `useNotificationStore.dmUnreads`/`channelUnreads` | ephemeral counters bumped on each ingest | lost on every reload |
| `useDMStore.readCursors` | localStorage-persisted unix-ms cursor per peer | exported, tested, **never called from production** |
| `useNotificationStore.channelLastReadAt`/`dmLastReadAt` | typed fields accepted by `setBulkUnreads` | never written, never read |

DMs got "stuck on UNREAD" after reading because the only path that cleared
them (`clearDMUnread`) was ephemeral. On reload, the empty unread map fell
through to a 24-hour heuristic in `PhoneShell.tsx` that re-flagged every
recent DM as unread. The flapping looked like flaky polling; there was no
polling, just a stale-state fallback flickering on and off as live ingest
repopulated the in-memory map.

Desktop had no DM unread badge at all (`DMList.tsx` didn't read either
store). `useFaviconBadge` was never mounted in production. Desktop never
wrote `useChatStore.activeChannelId`, so `isUserWatchingChannel()` always
returned false on desktop and the read-gate logic was silently disabled.

## Architecture

Three pieces:

1. **One persisted store** — `src/store/read-state.ts`. Cursors only.
2. **Pure derived selectors** — `src/lib/read-state/selectors.ts`. Counts.
3. **One auto-mark hook** — `src/hooks/useAutoMarkRead.ts`. Cursor advance.

Plus the existing `useFaviconBadge` (now actually mounted) and the
predicate helpers in `src/lib/read-gates.ts`.

```
                                                      ┌───────────────┐
  bridge dmsByPeer / messagesByGroup ─────────────▶  │ useXUnreadCount
  (already a Zustand StateStore)                     │  selectors    │
                                                      │ (derived,    │
  useReadStateStore.{dmCursors,groupCursors} ──────▶ │  pure)       │
  (persisted localStorage; monotonic; account-scoped)└────┬──────────┘
                                                          ▼
                              ┌───────────────────────────┴───────────────┐
                              │ ChannelRow / DmRow / FaviconBadge / nav   │
                              └───────────────────────────────────────────┘

                              ┌─────────────────────┐
  isUserWatchingDM/Channel ──▶│ useAutoMarkRead     │── setDmCursor /
  (visible+focused+active+    │ (mounted in AppGate)│   setGroupCursor
   nearBottom)                └─────────────────────┘   (monotonic)
```

### Storage shape

`src/store/read-state.ts`:

```typescript
interface ReadStateStore {
  dmCursors: Record<peerHex, tsMs>;      // unix ms; only advances
  groupCursors: Record<groupId, tsMs>;   // unix ms; only advances
  inboxLastReadAt: number;               // unix ms; "everything older is read"
  inboxEvents: InboxEvent[];             // ring buffer, cap 50, newest first

  setDmCursor(peer, tsMs): void;         // monotonic — max(prev, next)
  setGroupCursor(groupId, tsMs): void;
  advanceInboxRead(): void;
  pushInboxEvent(evt): void;
  clearInboxEvents(): void;
  reset(): void;
}
```

Persisted via Zustand `persist` middleware. The persist key is swapped on
login by `ensureReadStateStoreForAccount(myPubkey)`, mirroring
`ensureDMStoreForAccount`. Storage key shape:

```
obelisk-read-state:{myPubkey}
```

### Cursor monotonicity

Both `setDmCursor` and `setGroupCursor` are guarded so a smaller `tsMs`
than the existing one is a no-op. This makes the cursors a CRDT under
`max()`: two tabs (or, in Phase 2, two devices) can advance independently
and converge by taking the larger value per key.

### Bootstrap fallback

When a peer or channel has no cursor (first paint after deploy, or a
conversation the user has never opened), the selector falls back to
`Date.now() - 24h` at read time:

```typescript
function effectiveCursor(stored: number | undefined): number {
  return stored && stored > 0 ? stored : Date.now() - 86_400_000;
}
```

This matches the legacy 24h heuristic users already lived with so the
first paint after the deploy looks identical, and converges to a real
cursor as soon as they open the thread/channel for the first time.

Bootstrap is per-key on first read — not a one-shot migration script — so
no localStorage version bump is needed.

### Selectors

`src/lib/read-state/selectors.ts`:

| Hook | Returns | Source |
|---|---|---|
| `useDMUnreadCount(peer)` | unread count for one peer | `dmsByPeer[peer]` ∩ `m.outgoing===false` ∩ `m.createdAt*1000 > cursor` |
| `useTotalDMUnread()` | sum across peers | iterates `dmsByPeer` |
| `useChannelUnreadCount(groupId, ownPubkey)` | unread count, skipping own | `messagesByGroup[groupId]` ∩ `m.pubkey !== ownPubkey` ∩ cursor |
| `useChannelHasMention(groupId, ownPubkey)` | `boolean` | scans unread messages with `extractMentionPubkeys` |
| `useTotalChannelUnread(ownPubkey)` | sum across channels | iterates `messagesByGroup` |
| `useInboxUnreadCount()` | inbox cards newer than `inboxLastReadAt` | reads `inboxEvents` |

Each is a thin React hook that re-renders when its underlying store
changes. There is **no separate counter to keep in sync** — the only
write site is `setDmCursor` / `setGroupCursor`, called from a single
place: `useAutoMarkRead`.

### The auto-mark hook

`src/hooks/useAutoMarkRead.ts`:

- Mounted **once** in `AppGate.tsx`, gated on `useIsLoggedIn()`.
- Watches `useDMStore.activeDMPubkey` and `useChatStore.activeChannelId`.
- When `isUserWatchingDM/Channel()` returns true (visible + focused + active
  + nearBottom-for-channels), advances the matching cursor to the latest
  message's `createdAt`.
- Re-evaluates on `visibilitychange` / `focus` / `blur` and on bridge
  subscription updates. No timers, no polling.
- Does NOT touch `setActiveDM` / `setActiveChannel` — those stay owned by
  the shells' click handlers. The hook only reads active state and writes
  cursors.

### Mount points

```
src/app/app/AppGate.tsx
└── <ReadStateRoot/>  (if useIsLoggedIn())
    ├── useEffect → ensureReadStateStoreForAccount(myPubkey)
    ├── useEffect → ensureDMStoreForAccount(myPubkey)
    ├── useEffect → ensureForumFollowForAccount(myPubkey)
    ├── useAutoMarkRead()      // cursor advance
    └── useFaviconBadge()      // tab title + favicon dot
```

Both shells receive the same hooks; mobile and desktop are byte-for-byte
identical in read-state behavior.

### Inbox events

`useReadStateStore` also owns the inbox card log:

- `pushInboxEvent(evt)` — dedupes by stable id, caps at 50.
- `inboxLastReadAt: number` — single cursor for the inbox panel.
- `useInboxUnreadCount()` selector counts events newer than the cursor.
- `advanceInboxRead()` sets `inboxLastReadAt = Date.now()`.
- `clearInboxEvents()` wipes the log entirely.

The bridge ingest path (`client.ts:ingestMessage` / `ingestDM`) pushes
mention/dm cards directly into this store and gates by the current
`inboxLastReadAt` so historical backfill (older than the user's last
inbox-read) is silently dropped — no `notificationsStartedAt` cutoff
needed.

## LocalStorage conventions

The new convention table (also recorded in `CLAUDE.md`):

| Data type | Key pattern | Mechanism |
|---|---|---|
| Per-user state (cursors, prefs, follows) | `obelisk-{store}:{myPubkey}` | Zustand `persist` + `ensureXxxForAccount()` helper |
| Relay-derived metadata (lists, layouts, branding) | `obelisk-cache-v3/{relay}/{kind}/{id}` | `bridgeCache` in `src/lib/nostr-bridge/cache.ts` |
| UI-only state, non-personal | `obelisk-dex/{namespace}/{id}` | direct `localStorage` |
| Per-user UI flags | `obelisk-dex/{flag}/{myPubkey}` | direct `localStorage` |

Stores currently following this pattern:

- `obelisk-read-state:{pubkey}` — cursors + inbox (this doc)
- `obelisk-dm-store:{pubkey}` — DM protocol overrides
- `obelisk-forum-follow:{pubkey}` + `obelisk-forum-follow-meta:{pubkey}` — forum follows

`bridgeCache` stays relay-scoped because relay metadata is shared across
accounts on the same device. Channel content (`messagesByGroup`,
`groupMetadata`) is intentionally not persisted: it rehydrates from relay
subscriptions on connect, and `bridgeCache` already covers the small
slow-to-fetch pieces (admin/member lists).

## Cross-tab sync

Two tabs on the same account converge automatically:

- Zustand `persist` middleware writes to localStorage on every state
  change. Other tabs receive a `storage` event and rehydrate.
- Cursors are monotonic, so the `max()` merge is conflict-free.

No `BroadcastChannel`, no custom IPC. The legacy `notification-broadcast`
module was deleted in this refactor.

## Multi-device sync (Phase 2 — deferred)

Sketch for a future opt-in encrypted sync, NOT shipped today:

- Single replaceable kind 30078 event, d-tag `obelisk:readstate:v1`.
- Content is **NIP-44 self-encrypted** JSON: `{ v:1, dm:{}, group:{}, post:{}, inbox:tsMs }`.
- Encrypt with `signer.nip44Encrypt(myPubkey, ...)` — same self-encryption
  pattern as `src/lib/dm/cache-key.ts`. Relay sees only "user has read
  state," not which conversations.
- Subscribe newest-wins (mirror `src/lib/channel-layout.ts`).
- Merge rule: `max(local, remote)` per key. Cursors monotonic →
  conflict-free.
- Publish debounced 30s after last cursor change; skip if unchanged.
- `useReadStateStore.syncEnabled: boolean`, persisted, default `false`.
  A Settings toggle: "Sync read state to relay (other clients you log
  into will see your read positions sync; the relay sees only that you
  have read state, not which conversations)."

Phase 1 stands alone; Phase 2 is a ~200-line addon that imports cleanly
without touching the core selectors. Given the user's explicit preference
to avoid Primal-style "always-encrypted-on-relay" defaults, sync ships
off-by-default if it ships at all.

## Testing

| File | What it covers |
|---|---|
| `src/store/read-state.test.ts` | monotonicity, inbox cap/dedup, account-swap persist key |
| `src/lib/read-state/selectors.test.ts` | unread counts, own-message exclusion, mention detection, cursor edge cases |
| `src/hooks/useAutoMarkRead.test.tsx` | cursor advances on watching, halts on hidden, monotonic on backfill |
| `src/hooks/useFaviconBadge.test.tsx` | tab title + favicon reflect derived totals, react to cursor advance |
| `src/lib/read-gates.test.ts` | predicate gates only (handleIncoming* removed) |

End-to-end manual: see "Verification" in the original implementation
plan. The short version:

1. Receive a DM → mobile dot, bottom-nav badge, tab title `(1)`,
   favicon dot all light up.
2. Tap into the thread → all clear.
3. Hard reload → still clear (cursor persisted).
4. Identical behavior on desktop.
5. Two tabs same account: read in tab A → tab B clears via `storage` event.
6. Logout → log in as a different account → no leak.
