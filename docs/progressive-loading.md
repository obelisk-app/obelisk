# Progressive loading

How Obelisk paints the chat UI as relay data trickles in, instead of
holding the screen blank until every channel, member, and message has
arrived. Read this together with [auth-and-data-loading.md](./auth-and-data-loading.md),
which covers the login → connect contract that this layer sits on top of.

## 1. Goals

- **Channel structure paints first.** The sidebar (channel ids, names,
  categories, parent/child order via kind 30078 channel-layout) should be
  visible as soon as kind 39000 starts arriving. The user should never
  need to refresh to see the channel list.
- **Background message fetch is bounded.** A user that belongs to many
  channels was previously pulling 200 messages per channel × N channels
  on every login. Each per-group REQ now caps at
  `BACKGROUND_MESSAGE_LIMIT` (50). Older history is paged on demand.
- **Admin/member discovery is lazy.** Setting up a recently created
  channel must feel instant. Fanning out 39001/39002 REQs to every
  discovered group on login slowed setup and isn't necessary for the
  initial paint — it now happens when the user opens a channel.
- **Reliable retries.** Every per-sub watchdog (see auth-and-data-loading
  §7) re-issues dropped REQs with exponential backoff. Pagination uses
  `querySync` with a `maxWait` so a stuck relay can't hang the UI.

## 2. Load order

```
finalizeLogin()
└── connect()
    ├── ensureRelay(url)                      [per relay, with timeout]
    ├── seedCacheForRelay(url)                [paint sidebar from localStorage]
    ├── subscribeGroupMetadata()              [global, kind 39000]
    │     └── ingestGroupMetadata(ev)
    │         ├── this.groups.update(...)
    │         ├── subscribeGroupMessages(id)  [limit: BACKGROUND_MESSAGE_LIMIT]
    │         └── subscribeGroupCreator(id)   [kind 9007, limit: 1]
    ├── subscribeIncomingDMs()                [global, kind 4]
    ├── subscribeMyContactList()              [global, kind 3, limit: 1]
    └── ensureUserMetadata(my pubkey)         [kind 0]
```

Things deliberately NOT in this fan-out:

- **kind 39001 / 39002 (admin/member).** Opens lazily on the first
  `useAdmins(groupId)` / `useMembers(groupId)` call from the chat panel.
  `subscribeAdmins` / `subscribeMembers` already invoke
  `subscribeAdminMember(groupId)` internally; the eager fan-out used to
  duplicate that work for every visible group.
- **kind 7 (reactions).** Lazy via `subscribeReactions(groupId)` when a
  chat panel mounts.

The order matters: a user opening the app sees the sidebar populate first
(channel list, categories from kind 30078, ordering), then per-channel
content streams in as channels are touched.

## 3. Message backfill cap

`BACKGROUND_MESSAGE_LIMIT = 50` in `src/lib/nostr-bridge/client.ts`. Every
per-group REQ uses this. The cap is a tradeoff between:

- **Memory / network.** N channels × 200 messages was wasteful for users
  in many channels and inflated the initial AUTH-gated relay round-trip.
- **Notification anchoring.** The bridge's `notificationsStartedAt`
  cutoff drops historical events as backfill, so the 50-message window
  is enough to seed the visible tail without polluting the inbox.
- **First-paint latency.** A smaller `limit:` reduces the time-to-first
  rendered message on a cold open.

If the user wants older history they scroll up — the live REQ stays open
on the recent tail and `loadMoreMessages` pages backwards.

## 4. "Load earlier" pagination

`bridge.loadMoreMessages(groupId)` (see `client.ts`) does a one-shot
`pool.querySync` with `until = oldestSeen.created_at - 1` and
`limit = LOAD_MORE_PAGE_SIZE` (50), then routes the events through the
existing `ingestMessage` path so newest-wins de-duplication, mute / WoT
filtering, and reaction wiring all stay consistent with the live REQ.

Return value:

- `true` — at least one previously-unseen event was ingested. The UI can
  offer "Load earlier" again.
- `false` — nothing new arrived. The relay has either reached the start
  of history or timed out. The UI flips `reachedStart` and stops asking.

The React hook `useLoadEarlier(groupId)` (in `stores.ts`) wraps this with
in-flight de-duplication and a `reachedStart` flag that resets on group
change. Both `DesktopShell` and `PhoneShell` wire it into their existing
scroll listener: when `scrollTop < 80px` and no fetch is in flight, we
record the pre-load `scrollHeight`, await `loadEarlier()`, then restore
`scrollTop = scrollHeight - prevHeight` on the next animation frame so
the viewport stays anchored to the same message. Without that anchor the
list would snap to the new top every time a page lands.

## 5. Reliability

- **Watchdog retries.** Every `subscribeWatched` REQ re-issues on
  EVENT/EOSE silence (see [auth-and-data-loading §7](./auth-and-data-loading.md#7-watchdog-tunables)).
  No new retry layer is needed for live data — if a per-group messages
  REQ went silent, the watchdog already re-establishes it.
- **Pagination timeouts.** `loadMoreMessages` uses `querySync(..., { maxWait: 5000 })`
  so a stuck relay returns `false` after 5s and the UI lets the user
  retry by scrolling up again.
- **Newest-wins ingest.** All ingest paths (`ingestGroupMetadata`,
  `ingestAdminMember`, `ingestMessage`) check a per-id `created_at`
  cursor, so out-of-order arrivals (slow relay returning a stale
  snapshot after the fast one already delivered the current one)
  cannot regress UI state.
- **Stale-while-revalidate.** `bridgeCache` (see [auth-and-data-loading §8](./auth-and-data-loading.md#8-bridgecache-stale-while-revalidate))
  paints sidebar state from `localStorage` before any relay round-trip
  completes. Live events overwrite the cache on arrival.

## 6. Known regressions vs. previous eager fan-out

- The sidebar's "I'm an admin of X" gear icon no longer paints before
  the user opens that channel for the first time. Acceptable: opening
  the channel is a one-touch action and admin status resolves within
  the first relay round-trip after that.
- A muted-channel mention won't surface in the inbox until the user
  has opened that channel at least once in the session (the
  notification path keys off `ingestMessage`, which only fires while
  the per-group REQ is live). The 50-message tail keeps recent
  mentions visible once the channel is opened.

If either of these becomes a UX issue, the fix is targeted: re-introduce
an eager `subscribeAdminMember` only for groups where
`groupCreators[id] === myPubkey` (own-authored channels) so creator-set-up
stays instant without paying the cost for the long tail of joined groups.

## 7. Manual verification

For each shell (Desktop + Mobile):

1. Cold-load with a session in 20+ channels. Sidebar paints within 1
   relay round-trip. Network tab shows ≤50 events per kind 9 REQ.
2. Open a channel — most recent ~50 messages render. Scroll to top:
   "Load earlier" fires once, viewport stays anchored, older messages
   prepend.
3. Scroll to top again until the relay returns nothing — the loader
   stops firing on subsequent scroll-to-top events (`reachedStart`).
4. Create a brand-new channel, click into it: name + composer visible
   immediately; admin badge resolves within the first round-trip.
5. Switch channels rapidly — `reachedStart` resets per group; no stale
   "earlier loaded" state leaks between channels.

## 8. Related code

- `src/lib/nostr-bridge/client.ts` — `BACKGROUND_MESSAGE_LIMIT`,
  `LOAD_MORE_PAGE_SIZE`, `subscribeGroupMessages`, `loadMoreMessages`,
  `ingestGroupMetadata`.
- `src/lib/nostr-bridge/stores.ts` — `useLoadEarlier`.
- `src/app/app/DesktopShell.tsx` — channel scroll listener wiring.
- `src/app/app/mobile/PhoneShell.tsx` — channel scroll listener wiring.
