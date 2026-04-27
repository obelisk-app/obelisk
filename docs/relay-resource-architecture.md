# Relay Resource Architecture

How Obelisk loads, caches, decrypts, and shares Nostr-derived state across
the React tree. This document covers profiles (kind 0), DMs (kinds 4 +
1059), and the generic primitives every relay-fetcher is built on.

The goal is **single-source-of-truth + cache-first + decrypt-once + no
prop-drilled Maps**. Every component renders from one shared map per
resource; updates from relays fan out to every consumer through React
context.

---

## The two generic primitives

`src/lib/nostr-resource.ts` exposes two functions that encode the
loading contract once. Every relay-fetcher in the app is built on top of
one of them.

### `subscribeReplaceable<T>` — for kinds with one canonical "latest"

Use this for resources that have one current version per author/key
(profiles, follow lists, NIP-65 outbox, NIP-17 inbox). Dedup is by
`event.created_at`.

```ts
subscribeReplaceable<T>({
  filters,                      // Filter[] sent to relays
  relays,                       // string[] — caller dedups the union
  hydrate: () => T | null,      // synchronous read from cache
  persist: (value: T) => void,  // write a strictly-newer entry
  parse: (event) => T,          // domain shape
  match?: (event) => boolean,   // optional pre-dedup filter
  shouldFetch?: (cached) => boolean, // gate the relay round-trip (TTL)
  onCache?: (value: T) => void, // fires synchronously off the hydrator
  onUpdate?: (value: T) => void,// fires when a strictly-newer event lands
});
```

Lifecycle on call:

1. `hydrate()` runs; if it returns a value, `onCache(value)` is invoked
   synchronously **before** this function returns.
2. `shouldFetch(cached)` decides whether to open a relay subscription
   (e.g. profile-cache skips when `lastCheckedAt` is within 24h).
3. The subscription starts. Events that fail `match` are ignored.
   Events not strictly newer than the cached entry are dropped silently.
4. When a strictly-newer event arrives: `parse(event)` → `persist(entry)`
   → `onUpdate(entry)`.

### `subscribeStream` — for event streams

Use this for resources where each event is independent (DMs, kind 1
notes, zap receipts). Dedup is by `event.id`.

```ts
subscribeStream({
  filters,
  relays,
  hydrate: () => Iterable<NostrEvent>, // each yielded event fires onCache
  persist: (event) => void,            // write to underlying cache
  accept?: (event) => boolean,         // optional pre-write predicate
  onCache?: (event) => void,           // per cached event on subscribe
  onNew?: (event) => void,             // per never-before-seen event
});
```

Lifecycle:

1. `hydrate()` is iterated; `onCache(event)` fires for each yielded event.
   Each cached event id goes into the local seen-set.
2. The relay subscription starts. For each incoming event: skip if seen
   or `accept` returns false; otherwise `persist(event)` + `onNew(event)`.

Both primitives return a teardown function. Tests in
`src/lib/nostr-resource.test.ts`.

---

## Profiles (kind 0)

### Stack (top → bottom)

```
useProfile(pubkey) / useProfileMap()        // <- consumer hooks
ProfileProvider                              // <- React context, batching
subscribeProfile(me, partner, opts)          // <- domain wrapper
subscribeReplaceable<ProfileEntry>           // <- generic primitive
sharedCoalescer.enqueue                      // <- relay layer
```

### `ProfileProvider` (`src/components/ProfileProvider.tsx`)

- Mounted at the chat-page level so **both** the DM sidebar (`DMList`)
  and the chat panel (`DMChat`) read from the same map.
- Holds `Record<pubkey, ProfileEntry | null>` as React state.
- Owns at most ONE relay subscription per pubkey across the whole tree.
  First `useProfile(pk)` triggers a subscribe; later calls are no-ops.
- Batches updates from `subscribeProfile` (cache hydrate + relay
  updates) into one `setState` per ~16ms, so the inbox walker dropping
  100+ events in a burst doesn't spam re-renders.
- Per-entry referential stability — components only re-render when
  **their** partner's entry changes, not when a sibling's does.
- Tearing down on `me` change wipes every sub atomically.

### Hooks

```tsx
const profile = useProfile(somePubkey);  // → ProfileEntry | null
const map     = useProfileMap();         // → Record<pubkey, ProfileEntry | null>
```

`useProfile` returns `null` outside the provider (so consumers can be
unit-tested standalone) and triggers a subscribe in `useEffect`.

### `subscribeProfile` (`src/lib/dm/profile-cache.ts`)

Domain wrapper around `subscribeReplaceable<ProfileEntry>`:

- Hydrates from `localStorage` (key `obelisk:profiles:<me>`) into an
  in-memory keyed observable.
- TTL gating via `shouldFetch`: skips the relay round-trip when the
  cached entry's `lastCheckedAt` is within 24h.
- `match: event.kind === 0 && event.pubkey === partner`.
- Dedup by `created_at` is inherited from the primitive — older / equal
  events are dropped silently.
- Persists every accepted update to localStorage and the in-memory store.

Search relays for kind 0:

- `PROFILE_AGGREGATORS` — purplepag.es, damus, nos.lol, primal.
- `ndkPoolRelays()` — whatever NDK has discovered via outbox model.
- `dynamicRelays` — set by the DM walker after fetching the user's
  NIP-65 + extension `getRelays()` so partner avatars resolve from the
  same warm sockets the walker is already using.

---

## Direct Messages (kinds 4 + 1059)

### Stack

```
useDMThread(partner) / useLastDM(partner)    // <- consumer hooks
DMSessionProvider                            // <- decryption pipeline + state
decryptToEnvelope                            // <- shared decrypt (secrets-cache + signer)
subscribeStream                              // <- generic primitive
sharedCoalescer.enqueue                      // <- relay layer
```

### `DMSessionProvider` (`src/components/dm/DMSessionProvider.tsx`)

The DM equivalent of ProfileProvider. Holds **plaintext** DM state across
the app:

```ts
threads: Record<partnerPubkey, DMMessage[]>; // sorted oldest→newest
```

A single decryption pipeline:

1. Subscribed to `subscribeToCacheTick` from `dm-cache.ts`. Every cache
   mutation (live tail, walker windows, history fetch, send) fires the
   pipeline (debounced 200ms).
2. Walks new cached events not yet in `processedRef`, decrypts via the
   shared `decryptToEnvelope`, drops them into `threads[partner]`.
3. Bounded at `DECRYPT_BATCH = 10` per pass — small on purpose. Each
   NIP-17 wrap on a cold `secrets-cache` costs a signer prompt; 10 lets
   the user's freshest message per partner appear in seconds rather than
   waiting on a wall of Alby popups.
4. A 2s self-rescheduling interval backfills older events in the
   background once the first batch settles.
5. Re-entry guarded — concurrent ticks won't fire parallel decrypts.
6. Identity / cache-key change wipes `threads` and the processed set
   (no plaintext leak across accounts).

### `decryptToEnvelope` (`src/lib/dm/decrypt.ts`)

Shared decrypt helper used by the provider and any future on-demand
decrypt. Two-phase contract:

1. **Secrets-cache hit** (`getSecret` → AES-GCM unwrap with the
   account's KEK). Zero signer touches; succeeds for any wire event
   we've already decrypted at least once on this device.
2. **Signer fallback** (`signer.nip04Decrypt` for kind 4,
   `giftUnwrap(wrap, undefined, signer)` for kind 1059). Writes the
   plaintext envelope back to the secrets cache via `putSecret` so the
   next read is instant.

The KEK itself is derived once per session via
`signer.nip44Encrypt` (one prompt). After the KEK is in RAM, all
secrets-cache reads are AES-GCM only — no signer touch.

### Hooks

```tsx
const messages = useDMThread(partnerPubkey);   // DMMessage[] — sidebar / chat
const last     = useLastDM(partnerPubkey);     // DMMessage | null — sidebar preview
```

Both return safe defaults outside the provider so consumers can be
tested standalone. `useDMThread` returns a stable `EMPTY_THREAD` on miss
(referential identity matters — a fresh `[]` per render would loop
consumer effects).

### Read cursor + unread separator

`DMChat` snapshots the per-partner read cursor (`useDMStore.readCursors`)
into a ref at thread-open time. A "New messages" separator renders
before the first message strictly newer than that snap. The snap stays
put for the session so the line doesn't jump as `markThreadRead`
(triggered by `useReadTracker`) bumps the live cursor. On thread open:

- If there's a separator → scroll the separator into view at the top.
- Otherwise → jump to bottom (no animation; smooth-scroll-from-top
  looks like the page is scrolling itself).

Subsequent in-thread arrivals animate to bottom.

---

## DM event streams (loadHistory / loadOlder / loadInboxWindow / subscribeLive)

`src/lib/dm/dm.ts` — all four ingestion paths share a single helper:

```ts
function streamDMs(myPubkey, filters, relays): () => void {
  return subscribeStream({
    filters, relays,
    hydrate: () => [],                       // ingestion-only; cache reads via dm-cache
    accept: (event) => verifyDMEvent(event), // sig + shape check
    persist: (event) => verifyAndIngest(myPubkey, event), // dedup + cursor bump
  });
}
```

Same dedup-by-id contract everywhere; `verifyAndIngest` writes through
to the encrypted-at-rest cache and updates kind→cursor markers
(`nip04In`, `nip04Out`, `nip17Wrap`, `kind3`).

---

## NIP-65 / NIP-17 inbox lookups

`fetchMyInboxRelays` (kind 10050) and `fetchMyDmRelays` (kind 10002) are
Promise-shaped one-shots over `subscribeReplaceable`. Both share a
`fetchOwnRelayList(args: { pubkey, kind, searchRelays, parseTags })`
helper — DRY and uniform with the rest of the resource layer.

---

## Coalescer (`src/lib/nostr-coalescer.ts`)

The shared layer underneath every primitive:

- 50ms debounce window: enqueues sharing the same relay-set in that
  window are merged into a single `subscribeMany` REQ per relay.
- 20s subscription timeout (was 5s): the relay round-trip needs cold-
  connect time on top of REQ → EVENT → EOSE; 5s left no headroom.
- One filter per `subscribeMany` call, not arrays — `nostr-tools`
  `SimplePool.subscribeMany(relays, filter, params)` takes a single
  filter despite the misleading "Many" name (which refers to relays).
  The pool internally groups same-relay calls into one REQ with
  multiple filters before sending.

`src/lib/nostr-pool.ts` exposes `getNostrPool()` with a custom
`TextCoercingWebSocket` that decodes binary frames (Blob / ArrayBuffer)
to UTF-8 strings before nostr-tools sees them — works around relays that
push compressed binary frames and would otherwise crash
`getSubscriptionId`.

---

## Migration notes for new fetchers

- **One canonical "latest"** (kinds 0, 3, 10002, 10050, 10003, 10006…)
  → `subscribeReplaceable<T>`. Add a domain wrapper module that owns
  the cache layer (in-memory observable + localStorage) and a
  `subscribeX(me, target, opts)` API.
- **Event stream** (kinds 1, 4, 1059, 9735, 30023…) → `subscribeStream`.
  Build the React-side state holder either as a context provider (for
  cross-tree shared state) or a Zustand store.
- **Single shared map across the tree?** Wrap consumers in a context
  provider (mirror `ProfileProvider`). Mount it at the highest level
  that contains every consumer — sibling components outside the
  provider tree won't see updates.
- **Per-component `useEffect(fn, [map[id]])` access pattern** falls out
  for free once the resource has a context provider. Components don't
  need to know about subscription lifecycle.

See also: `src/lib/nostr-resource.ts` for the full primitive types,
`src/lib/dm/profile-cache.ts` for the canonical replaceable example,
`src/lib/dm/dm.ts` for the canonical stream example.
