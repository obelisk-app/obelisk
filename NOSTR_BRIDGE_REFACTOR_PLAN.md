# Plan: Deduplicate and Optimize `src/lib/nostr-bridge/client.ts`

> **Status:** Reference document. Hold off executing — user is finishing other modifications first and will revisit this plan when ready.

## Context

`src/lib/nostr-bridge/client.ts` is the central SimplePool wrapper that backs all relay-derived state in the app (groups, members, messages, reactions, DMs, profiles, contact lists). It has grown to ~3500 lines and accumulated two distinct problems:

1. **Duplicated boilerplate** — the same shapes of code repeated across many methods (trivial `subscribeXxx` pass-throughs, per-group REQ methods with identical idempotency guards, cache-seed loops, group-scoped adapter wrappers, `ev.tags.find(...)` lookups). This makes the file harder to read, harder to change consistently, and easy to bug-fix in one place but forget in others.

2. **Performance redundancy** — work the bridge does on every event/login that could be done less often or more cheaply. The most expensive: a global admin/member REQ AND per-group admin/member REQs both running for the same kinds; `childrenByParent` rebuilt with `Object.keys()` + `.filter()` on every kind-39000 ingest; `ev.tags` scanned 7+ times in `ingestGroupMetadata`; `cacheSet` fires on every relay resend even when the value is unchanged.

The intended outcome is a leaner client.ts with measurably less CPU per metadata burst, fewer redundant relay REQs, ~200 fewer lines of code, and a small set of reusable helpers that future per-kind subscriptions can adopt without reinventing the shape each time.

---

## Section A — Performance Redundancy (do these first; user-visible wins)

### A1. Eliminate redundant per-group admin/member REQs ★ highest network impact
**Where:** `src/lib/nostr-bridge/client.ts:3018-3028` (`subscribeAllAdminMember`) AND `src/lib/nostr-bridge/client.ts:3211-3226` (`subscribeAdminMember`).

**Problem:** `connect()` opens a global REQ for `kinds: [39001, 39002]` (no `#d` filter), which delivers every admin/member event on the relay. Then `useAdmins(groupId)` / `useMembers(groupId)` hooks call `subscribeAdminMember(groupId)`, which opens a *second* REQ filtered by `#d: [groupId]` — but every event it would receive is already covered by the global sub. On an account that opens 100 channels, that's ~100 redundant REQ slots feeding the same events.

**Fix:** Make `subscribeAdminMember(groupId)` a no-op after asserting the global sub is open (or remove it entirely and have `subscribeAdmins`/`subscribeMembers`/`subscribeMembershipReady` skip the call). Move the `adminMemberSubscribedGroups` Set check + `membershipReadyByGroup` flip into the global ingest path so a per-group "ready" signal still fires.

**Risk:** Verify the global sub is opened *before* any `useAdmins`/`useMembers` call. It is — `subscribeAllAdminMember` runs from `connect()` and `connect()` is awaited inside `finalizeLogin()` (line ~1000), which gates `isLoggedIn.set(true)`, which gates `AppShell` mounting any chat UI. Safe.

**Estimated saving:** ~30 lines + drops relay-side REQ pressure proportional to channel count.

---

### A2. Reverse index for `childrenByParent` ★ highest CPU impact
**Where:** `src/lib/nostr-bridge/client.ts:3520-3533` inside `ingestGroupMetadata`.

**Problem:** Every kind-39000 event triggers:
```ts
const next: Record<string, string[]> = { ...prev };
for (const k of Object.keys(next)) {            // O(parents)
  if (next[k].includes(groupId)) {              // O(children-of-k)
    next[k] = next[k].filter((id) => id !== groupId);
  }
}
```
On a relay with 500 groups and ~50 parent containers, that's 500 × 50 = 25,000 array operations per metadata burst.

**Fix:** Maintain a private `groupParentMap: Map<groupId, parentId | null>` on the bridge. On every `ingestGroupMetadata`:
1. Look up the previous parent in O(1).
2. If it differs from the new parent, remove this groupId from the old parent's children bucket and add it to the new one's.
3. Update the reverse map.

```ts
this.childrenByParent.update((prev) => {
  const oldParent = this.groupParentMap.get(groupId) ?? null;
  if (oldParent === parent) return prev;          // no-op fast path
  const next = { ...prev };
  if (oldParent && next[oldParent]) {
    next[oldParent] = next[oldParent].filter((id) => id !== groupId);
  }
  if (parent) {
    const arr = next[parent] ?? [];
    if (!arr.includes(groupId)) next[parent] = [...arr, groupId].sort();
  }
  this.groupParentMap.set(groupId, parent);
  return next;
});
```

**Estimated saving:** 50-100ms per 500-group metadata burst on first paint after login.

---

### A3. Single-pass tag parsing in `ingestGroupMetadata`
**Where:** `src/lib/nostr-bridge/client.ts:3433-3476`.

**Problem:** Seven separate `ev.tags.some(...)` / `ev.tags.find(...)` / `for (const t of ev.tags)` scans per ingest:
- `tag('d')`, `tag('parent')`, `tag('name')`, `tag('about')`, `tag('picture')`, `tag('banner')` — 6 `find` calls (line 3434, 3479-3482).
- `some('public')`, `some('open')` (3443-3444).
- `some('voice-sfu')`, `some('voice')`, `some('forum')` (3451-3453).
- forum-tag loop (3460-3467).
- topic loop (3473-3475).

**Fix:** One pass that builds a typed accumulator:
```ts
type TagBag = {
  d?: string;
  parent?: string;
  name?: string;
  about?: string;
  picture?: string;
  banner?: string;
  public: boolean;
  open: boolean;
  channelKind: 'voice-sfu' | 'voice' | 'forum' | null;
  forumTags: Map<string, JsForumTag>;
  topics: Set<string>;
};
function parseGroupTags(tags: NostrEvent['tags']): TagBag { /* one for loop */ }
```
Call once at the top of `ingestGroupMetadata`. Remove the inline `tag` lambda and all the `.some(...)` calls.

**Estimated saving:** ~5-10% CPU on metadata-heavy first paints. Modest individually, but stacks with A2 on the same hot path.

---

### A4. Skip cache writes when value is unchanged
**Where:** `src/lib/nostr-bridge/client.ts:3298` (`ingestAdminMember`), `:3497` (`ingestGroupMetadata`), `:3831` (`ingestUserMetadata`).

**Problem:** Relays often resend the same kind-39001/39002/0 event after a reconnect or a slow EOSE. The `created_at`-guard short-circuits the store update, but `cacheSet` is called outside the guard for some paths and writes the same blob to localStorage anyway. Even when it is inside the guard, two relays delivering the same `created_at` value still trigger the write twice.

**Fix:** Compare against the cached entry before writing:
```ts
const prev = cacheGet<string[]>(relay, ev.kind, groupId);
if (!prev || !arraysEqual(prev.value, pubkeys)) {
  cacheSet(relay, ev.kind, groupId, pubkeys);
}
```
For metadata, compare `createdAt` *and* serialize-equality of the group object.

**Estimated saving:** ~30-50% fewer localStorage writes during normal session activity. Less IO main-thread blocking.

---

### A5. Lower-priority perf items (revisit only if needed)
These are real but smaller; document for completeness:

- **B (audit Finding 3):** `messagesEoseByGroup` destructuring per subscribe — minor GC churn, fix when refactoring the EOSE map to a `Set`.
- **C (audit Finding 6):** `ev.tags.find('e')` per reaction ingest — replace with the same `getTag(ev, 'e')` helper introduced in B5.
- **D (audit Finding 10):** All `messagesByGroup` subscribers fire on every group's update because the adapter sits over the whole map — to fix properly, add `StateStore.subscribeKey(key, cb)` to `cache.ts`/`stores.ts`. Larger refactor; skip unless a profiler shows it.

---

## Section B — Code Duplication (collapse boilerplate; readability + future-proofing)

### B1. Generic store-subscribe pass-through helper
**Where (callers):** `src/lib/nostr-bridge/client.ts:1564-1731`.

**Problem:** 16 public methods are one-liners that delegate to a `StateStore.subscribe`:
- `subscribeConfiguredRelays`, `subscribeIsLoggedIn`, `subscribeRelayAccess`, `subscribeConnectionState`, `subscribeCurrentRelayUrl`, `subscribeMyPubkey`, `subscribeMyLoginMethod`, `subscribeBunkerSignerReady`, `subscribeGroups`, `subscribeGroupMetadataEose`, `subscribeMessagesByGroup`, `subscribeMyFollows`, `subscribeMyMutes`, `subscribeChildrenByParent`, `subscribeAdminsByGroup`, `subscribeMembersByGroup`.

**Fix:** Keep the public surface (the interface in `types.ts` expects these methods) but make each a single-line `return this.X.subscribe(cb)` — they already are. The real win is to drop them entirely and expose `bridge.stores.X.subscribe(cb)` to the hooks in `stores.ts`. Cheaper option that keeps the API stable: introduce
```ts
const passthrough = <T>(store: StateStore<T>) => (cb: Listener<T>) => store.subscribe(cb);
```
and assign each method to that constant in the constructor.

**Estimated saving:** ~30-40 lines.

---

### B2. Group-scoped subscribe adapter helper
**Where:** `src/lib/nostr-bridge/client.ts:1633-1639` (`subscribeMessages`), `:1654-1657` (`subscribeMessagesEose`), `:1659-1662` (`subscribeUserMetadata`), `:1665-1672` (`subscribeReactions`), `:1696-1699` (`subscribeAdmins`), `:1708-1711` (`subscribeMembers`), `:1727-1730` (`subscribeMembershipReady`).

**Problem:** All 7 do the same shape: call an `ensureXxx(id)` to open the underlying REQ, then build an adapter that pulls `byGroup[id]` from a per-group map store.

**Fix:** Extract:
```ts
private subscribeKeyed<TItem>(
  ensure: (key: string) => void,
  store: StateStore<Record<string, TItem>>,
  key: string,
  fallback: TItem,
  cb: (value: TItem) => void,
): Unsubscribe {
  ensure(key);
  return store.subscribe((byKey) => cb(byKey[key] ?? fallback));
}
```
Callers become:
```ts
subscribeAdmins(groupId, cb) {
  return this.subscribeKeyed((id) => this.subscribeAdminMember(id), this.adminsByGroup, groupId, [], cb);
}
```

**Estimated saving:** ~40-50 lines.

---

### B3. Per-group filtered REQ helper
**Where:** `subscribeGroupMessages` (~3108), `subscribeGroupReactions` (~3197-3208), `subscribeAdminMember` (~3211-3226), `subscribeGroupCreator` (~3237-3248).

**Problem:** All four:
1. Bail if the group is already in a `subscribedXxxGroups` Set.
2. Add to the Set.
3. Build a `Filter` with `kinds: [...]` and one of `#h: [groupId]` or `#d: [groupId]`.
4. Call `this.subscribeWatched(this.relays, filter, ingest, ...)`.
5. Push the sub onto `this.subs`.

**Fix:** Extract:
```ts
private subscribePerGroup(opts: {
  set: Set<string>;
  groupId: string;
  kinds: number[];
  tag: 'h' | 'd';
  limit?: number;
  onEvent: (ev: NostrEvent) => void;
  watchedOpts?: SubscribeWatchedOpts;
}): void {
  if (opts.set.has(opts.groupId)) return;
  opts.set.add(opts.groupId);
  const filter: Filter = { kinds: opts.kinds, [`#${opts.tag}`]: [opts.groupId] };
  if (opts.limit) filter.limit = opts.limit;
  const sub = this.subscribeWatched(this.relays, filter, opts.onEvent, undefined, opts.watchedOpts);
  this.subs.push(sub);
}
```
NOTE: combine with A1 — `subscribeAdminMember(groupId)` may not survive the perf pass.

**Estimated saving:** ~50-70 lines.

---

### B4. Cache-seed loop helper
**Where:** `src/lib/nostr-bridge/client.ts:891-963` (`seedCacheForRelay`).

**Problem:** Five near-identical loops over `cacheListIds(relay, KIND)` → `cacheGet` → `store.update`. Differences are limited to (a) the store, (b) the value type, (c) a post-process hook (membership-ready flag for admins/members; createdAt tracking for metadata; cap for user metadata).

**Fix:** Extract:
```ts
private seedCacheKind<T>(
  relay: string,
  kind: number,
  store: StateStore<Record<string, T>>,
  opts?: { cap?: number; postProcess?: (id: string, value: T) => void },
): void {
  const ids = cacheListIds(relay, kind);
  const targets = opts?.cap && ids.length > opts.cap ? ids.slice(0, opts.cap) : ids;
  for (const id of targets) {
    const entry = cacheGet<T>(relay, kind, id);
    if (!entry) continue;
    store.update((prev) => (prev[id] === entry.value ? prev : { ...prev, [id]: entry.value }));
    opts?.postProcess?.(id, entry.value);
  }
}
```
Admins/members pass `postProcess: (id) => this.membershipReadyByGroup.update(...)`. User metadata uses the cap.

**Estimated saving:** ~50-70 lines.

---

### B5. `getTag(ev, name)` module helper
**Where:** Multiple — `:3269` (`ingestGroupCreator`), `:3281`, inline lambdas at `:3369` and `:3434`, `:3617` (`ingestReaction`), `:3537` (mention extraction).

**Problem:** Same `ev.tags.find((t) => t[0] === name)?.[1]` pattern repeated. The `tag` helper is even defined twice as an inline lambda in different methods.

**Fix:** Add to `src/lib/nostr-bridge/client.ts` (or `types.ts`) at module scope:
```ts
function getTag(ev: NostrEvent, name: string): string | undefined {
  for (const t of ev.tags) if (t[0] === name) return t[1];
  return undefined;
}
function getAllTags(ev: NostrEvent, name: string): string[] {
  return ev.tags.filter((t) => t[0] === name).map((t) => t[1]).filter(Boolean);
}
```
Replace every inline use. Pairs with A3 — `parseGroupTags` will use these too.

**Estimated saving:** ~10-15 lines + makes A3 cleaner.

---

### B6. Lower-priority dedup items (revisit only if needed)
- **Login-method tail convergence** (~3 methods at `:856-875`, `:1115-1154`) — extract `commitSession(session)` that does `this.session = session; await this.finalizeLogin();`. ~15 lines.
- **"Newest-wins list" subscribe** (`subscribeMyContactList`, `subscribeMyMuteList` at `:3308-3343`) — extract `subscribePersonalList(kinds, store, onItem?)`. ~25 lines.
- **`setAndCache` orchestration** for the dozen places that do `store.update + cacheSet` together. Low payoff — skip unless A4 makes the pattern uniform enough to warrant it.

---

## Section C — Files to Modify

Primary:
- `src/lib/nostr-bridge/client.ts` — all the above lives here.

Probably untouched but verify for ripple:
- `src/lib/nostr-bridge/cache.ts` — `cacheGet`/`cacheSet`/`cacheListIds` signatures stay the same; A4 just adds an equality check on the caller side.
- `src/lib/nostr-bridge/stores.ts` — React hooks call the public `subscribeXxx` methods; B1 and B2 keep the public API intact, so this file is read-only for this work.
- `src/lib/nostr-bridge/types.ts` — `NostrBridge` interface is the contract; do not change method signatures.
- `src/lib/nostr-bridge/client.test.ts` (and any sibling `*.test.ts`) — extend existing tests, do not break them. See verification.

---

## Section D — Verification

Per CLAUDE.md: "A feature is NOT done until its tests are written, passing, and the full suite runs green."

1. **Unit / integration tests (existing must pass):**
   - `npm run test` — full Vitest suite green.
   - Especially exercise `bridge.test.ts` and `login-race.test.ts` (the `FakePool`-based tests). The `FakePool` will reveal any change in REQ shape or count — *good*, that's where A1 will surface.

2. **New tests to add:**
   - **A1 regression test:** assert that opening 5 channels does NOT cause 5 extra `kinds: [39001, 39002]` REQs through the `FakePool`. Count `pool.subscribe` calls before/after `useAdmins`/`useMembers` invocations.
   - **A2 invariant test:** ingest 3 metadata events that re-parent the same groupId; assert `childrenByParent` reflects only the final parent and that no other parent contains the groupId.
   - **A3 parity test:** snapshot the `JsGroup` produced by `ingestGroupMetadata` for a fixture event with all tag types (public, open, voice-sfu, forum-tag×3, topic×2) before and after the refactor — must be identical.
   - **A4 idempotency test:** ingest the same kind-39001 event twice; assert `cacheSet` is called only once.
   - **B-series:** behavioral tests already cover the public surface; the helpers are internal. Smoke-test that `subscribeAdmins(g, cb)` still fires `cb([])` on subscribe-before-event and `cb([pk])` after an event.

3. **Manual relay-level smoke:**
   - Log in with a many-group account, observe Network DevTools → WebSocket frames for `wss://relay.obelisk.ar`. Before A1: expect N REQs with `#d`. After: 1 global REQ for 39001/39002, zero per-group REQs.
   - Open Performance tab, record from login → "all sidebar channels visible". Compare flame-graph time in `ingestGroupMetadata` before/after A2+A3. Should drop visibly on a 200+ group account.
   - Watch `localStorage` write count via DevTools → Application → Storage; A4 should cut writes per refresh roughly in half on a busy relay.

4. **`npm run build`** must complete without TS errors.

---

## Execution sequence (when ready to land)

Suggested commit order so each commit is independently green:

1. `refactor(nostr-bridge): add getTag / getAllTags module helpers` — B5. Pure helpers, no behavior change.
2. `refactor(nostr-bridge): single-pass tag parsing in ingestGroupMetadata` — A3 + uses B5.
3. `perf(nostr-bridge): O(1) reverse index for childrenByParent` — A2.
4. `perf(nostr-bridge): skip redundant admin/member per-group REQs` — A1. Highest-risk commit — own commit so it can be reverted cleanly if something regresses.
5. `perf(nostr-bridge): skip cache writes when value unchanged` — A4.
6. `refactor(nostr-bridge): extract subscribePerGroup helper` — B3.
7. `refactor(nostr-bridge): extract subscribeKeyed adapter helper` — B2.
8. `refactor(nostr-bridge): extract seedCacheKind helper` — B4.
9. `refactor(nostr-bridge): collapse trivial subscribe pass-throughs` — B1.

Each commit ends with `npm run test` green and `npm run build` clean.

---

## Estimated net delta

| Area | Lines removed | Wall-clock CPU saving | Network saving |
|------|---------------|-----------------------|----------------|
| A1 (admin/member REQ dedup) | ~30 | small | N→1 REQs per channel-open burst |
| A2 (childrenByParent index) | ~5 | 50-100ms / 500-group burst | — |
| A3 (single-pass tags) | ~10 | 5-10% on metadata path | — |
| A4 (cache-write skip) | ~5 | minor | ~50% fewer localStorage writes |
| B1 (pass-throughs) | ~35 | — | — |
| B2 (subscribeKeyed) | ~45 | — | — |
| B3 (subscribePerGroup) | ~60 | — | — |
| B4 (seedCacheKind) | ~60 | — | — |
| B5 (getTag) | ~12 | — | — |
| **Total** | **~260** | meaningful | meaningful |
