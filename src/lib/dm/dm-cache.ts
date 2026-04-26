/**
 * Per-account DM cache with two storage layers:
 *   1. `events` — wire-encrypted events (NIP-04 ciphertext or NIP-17 gift wraps),
 *      persisted as-is. Wire format on disk; never plaintext.
 *   2. `secrets` — decrypted DM bodies wrapped by the per-account cache key
 *      (AES-GCM, see `cache-key.ts`). Never plaintext on disk.
 *
 * Plus per-(kind, direction) `cursors` for incremental sync, and follow-aware
 * LRU eviction: events whose partner is in the current follow set are
 * protected from the cap. The follow set is set externally (Task 7 will
 * populate it from kind-3); the cache exposes `setFollowSet`/`getFollowSet`
 * and consults it during `evictIfNeeded`.
 */

import { encryptToCache, decryptFromCache } from './cache-key';

export interface CachedDMEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;          // 4 or 1059
  content: string;       // wire-encrypted ciphertext
  tags: string[][];
  sig: string;
}

export interface DMCursors {
  nip04In: number;
  nip04Out: number;
  nip17Wrap: number;
  kind3: number;
}

interface CacheShape {
  events: Record<string, CachedDMEvent>;
  secrets: Record<string, string>; // eventId → AES-GCM ciphertext blob
  cursors: DMCursors;
}

// In-memory follow sets; populated externally by Task 7.
// Cold-start safety: if `setFollowSet` was never called for a pubkey, OR was
// called with `null`, treat the follow list as un-hydrated → `evictIfNeeded`
// is a no-op (all events protected). Only an actual `Set<string>` (possibly
// empty) means "follow list HAS been fetched and is the source of truth";
// only then does eviction become eligible.
const followSets = new Map<string, Set<string> | null>();

// In-memory mirror of the persisted shape, keyed by account pubkey. We read
// localStorage lazily on first access per pubkey, then keep the parsed shape
// in memory. Subsequent puts mutate this object and re-stringify into
// localStorage. This avoids O(N) JSON.parse on every read and keeps inserts
// closer to O(1) amortized for the in-memory path.
// Single-tab cache. Does not detect cross-tab writes; if Obelisk grows multi-tab DM sessions, add a versioned mirror or storage-event listener.
const ramCache = new Map<string, CacheShape>();

const DEFAULT_CURSORS: DMCursors = { nip04In: 0, nip04Out: 0, nip17Wrap: 0, kind3: 0 };

function keyFor(pk: string): string { return `obelisk:dm:${pk}`; }

function emptyShape(): CacheShape {
  return { events: {}, secrets: {}, cursors: { ...DEFAULT_CURSORS } };
}

function read(pk: string): CacheShape {
  const cached = ramCache.get(pk);

  // If we have unflushed writes pending, ramCache is authoritative — don't
  // even consult localStorage (it lags by at most one microtask, but that's
  // long enough for an interleaved read to see a stale-empty entry).
  if (cached && pendingFlush.has(pk)) return cached;

  // Otherwise, localStorage is the source of truth for invalidation: if the
  // persisted entry is gone (another tab or a test cleared it), drop the
  // in-memory mirror and rebuild. The hot path stays O(1) when the mirror
  // matches; we only re-parse on cache miss or external clear.
  const persisted = typeof localStorage !== 'undefined' ? localStorage.getItem(keyFor(pk)) : null;

  if (cached && persisted !== null) return cached;
  if (cached && typeof localStorage === 'undefined') return cached;

  let shape: CacheShape;
  if (!persisted) {
    shape = emptyShape();
  } else {
    try {
      const parsed = JSON.parse(persisted) as Partial<CacheShape>;
      shape = {
        events: parsed.events ?? {},
        secrets: parsed.secrets ?? {},
        cursors: { ...DEFAULT_CURSORS, ...(parsed.cursors ?? {}) },
      };
    } catch {
      shape = emptyShape();
    }
  }
  ramCache.set(pk, shape);
  return shape;
}

// Pending flushes — coalesce a burst of put*/setCursor calls into one
// JSON.stringify per microtask per pubkey. Reads still see the latest state
// via the ramCache mirror; only durability-to-localStorage is deferred.
const pendingFlush = new Set<string>();

function flush(pk: string): void {
  pendingFlush.delete(pk);
  if (typeof localStorage === 'undefined') return;
  const shape = ramCache.get(pk);
  if (!shape) return;
  try {
    localStorage.setItem(keyFor(pk), JSON.stringify(shape));
  } catch (err) {
    console.warn('[dm-cache] write failed:', err);
  }
}

function scheduleFlush(pk: string): void {
  if (pendingFlush.has(pk)) return;
  pendingFlush.add(pk);
  queueMicrotask(() => flush(pk));
}

function write(pk: string, shape: CacheShape): void {
  ramCache.set(pk, shape);
  scheduleFlush(pk);
}

export function putEvent(myPubkey: string, ev: CachedDMEvent): void {
  const c = read(myPubkey);
  c.events[ev.id] = ev;
  write(myPubkey, c);
}

export function getEvent(myPubkey: string, id: string): CachedDMEvent | undefined {
  return read(myPubkey).events[id];
}

export function getCachedEvents(myPubkey: string): CachedDMEvent[] {
  return Object.values(read(myPubkey).events);
}

export async function putSecret(
  myPubkey: string,
  key: CryptoKey,
  eventId: string,
  plaintext: string,
): Promise<void> {
  const c = read(myPubkey);
  c.secrets[eventId] = await encryptToCache(key, plaintext);
  write(myPubkey, c);
}

export async function getSecret(
  myPubkey: string,
  key: CryptoKey,
  eventId: string,
): Promise<string | undefined> {
  const blob = read(myPubkey).secrets[eventId];
  if (!blob) return undefined;
  try {
    return await decryptFromCache(key, blob);
  } catch {
    return undefined;
  }
}

export function getCursors(myPubkey: string): DMCursors {
  return read(myPubkey).cursors;
}

export function setCursor(myPubkey: string, name: keyof DMCursors, value: number): void {
  const c = read(myPubkey);
  if (value > c.cursors[name]) {
    c.cursors[name] = value;
    write(myPubkey, c);
  }
}

/**
 * Register the follow set used by `evictIfNeeded` for `myPubkey`.
 *
 * - `null` (or never calling this function) → cold-start: `evictIfNeeded`
 *   is a no-op (all events protected). Use this state until kind-3 is hydrated.
 * - `new Set()` → empty follow list: nothing is protected, full LRU.
 * - `new Set([...pubkeys])` → only events from/to those pubkeys are protected.
 */
export function setFollowSet(myPubkey: string, set: Set<string> | null): void {
  followSets.set(myPubkey, set);
}

export function getFollowSet(myPubkey: string): Set<string> | null {
  return followSets.get(myPubkey) ?? null;
}

function partnerOf(ev: CachedDMEvent, myPubkey: string): string {
  if (ev.kind === 4) {
    const pTag = ev.tags.find((t) => t[0] === 'p');
    return ev.pubkey === myPubkey ? (pTag?.[1] ?? '') : ev.pubkey;
  }
  // For NIP-17 wraps, the wrap pubkey is ephemeral; partner is unknown until
  // the rumor is decrypted. Treat unresolved wraps as "unknown" → eligible
  // for LRU eviction.
  return '';
}

/**
 * Apply LRU eviction. Events whose partner is in the current follow set are
 * protected and never evicted by `cap`. The cap applies only to evictable
 * events.
 *
 * Cold-start safety: if `setFollowSet` has never been called for `myPubkey`
 * (no entry in the map) OR was explicitly called with `null`, the follow list
 * is treated as un-hydrated and this function is a no-op (all events
 * protected). Only an actual `Set<string>` (possibly empty) makes events
 * eligible for eviction; an empty Set means "no follows known but the follow
 * list HAS been fetched" → no protection, full LRU.
 */
export function evictIfNeeded(myPubkey: string, cap = 2000): void {
  const c = read(myPubkey);
  const ids = Object.keys(c.events);
  if (ids.length === 0) return;

  const followsEntry = followSets.has(myPubkey) ? followSets.get(myPubkey) : undefined;
  // Cold start: never set, or explicitly set to null → protect everything.
  if (followsEntry === undefined || followsEntry === null) return;

  const follows = followsEntry; // Set<string>
  const evictableIds: string[] = [];

  for (const id of ids) {
    const ev = c.events[id];
    const partner = partnerOf(ev, myPubkey);
    if (partner && follows.has(partner)) {
      // protected — never evicted
      continue;
    }
    evictableIds.push(id);
  }

  if (evictableIds.length <= cap) return;

  // Oldest-first: drop the lowest created_at evictables until the count fits.
  evictableIds.sort((a, b) => c.events[a].created_at - c.events[b].created_at);
  const toDrop = evictableIds.slice(0, evictableIds.length - cap);
  for (const id of toDrop) {
    delete c.events[id];
    delete c.secrets[id];
  }
  write(myPubkey, c);
}

export function clearAccount(myPubkey: string): void {
  ramCache.delete(myPubkey);
  followSets.delete(myPubkey);
  pendingFlush.delete(myPubkey);
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(keyFor(myPubkey));
  } catch { /* ignore */ }
}

/**
 * Drop all in-RAM dm-cache state for every account. Used by
 * `resetAllClientState()` on logout/account-switch so module-level Maps don't
 * leak across identities. Persistent localStorage entries are NOT touched —
 * they're per-pubkey-keyed already and the next session's `read()` will
 * rehydrate from disk (or rebuild empty if the user explicitly wiped them).
 */
export function _resetDMCacheState(): void {
  ramCache.clear();
  followSets.clear();
  pendingFlush.clear();
}
