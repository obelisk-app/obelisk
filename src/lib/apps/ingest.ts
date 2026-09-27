/**
 * The single seam every session event enters the store through, batched so
 * a relay burst is one store update (carried over from lib/games/ingest.ts),
 * plus the localStorage cache that lets a chat card paint before the relay
 * answers (carried over from lib/games/cache.ts).
 *
 * Cached per relay and session through bridgeCache. Raw signed events are
 * stored as-is — they are public relay data, the same thing the relay would
 * send — minus any event whose content is over CACHE_EVENT_MAX_CONTENT (a
 * realtime checkpoint with its input log): omitted whole, never stripped,
 * because a stripped copy would shadow the real one by id forever.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { cacheDelete, cacheGet, cacheSet } from '@/lib/nostr-bridge/cache';
import { getBridgeImpl } from '@/lib/nostr-bridge/client';
import { KIND_APP_SESSION } from '@/lib/nip-kinds';
import { registerClientResetHook } from '@/lib/reset';
import { useAppsStore } from '@/store/apps';

import { sessionIdOf } from './session';

export const INGEST_BATCH_MS = 32;
export const CACHE_EVENT_LIMIT = 120;
export const CACHE_EVENT_MAX_CONTENT = 4096;
export const CACHE_FLUSH_MS = 200;

type Listener = (evs: readonly NostrEvent[]) => void;

let queue: NostrEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<Listener>();

/** Live taps (an open app frame) get each flushed batch after the store does. */
export function onIngest(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function ingestSessionEvents(evs: readonly NostrEvent[]): void {
  if (evs.length === 0) return;
  for (const ev of evs) queue.push(ev);
  if (timer === null) timer = setTimeout(flushIngest, INGEST_BATCH_MS);
}

export function flushIngest(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];
  useAppsStore.getState().ingestMany(batch);
  const touched = new Set<string>();
  for (const ev of batch) {
    const sid = sessionIdOf(ev);
    if (sid) touched.add(sid);
  }
  scheduleCacheFlush(touched);
  for (const fn of listeners) fn(batch);
}

// ---- cache ----

const dirty = new Set<string>();
let cacheTimer: ReturnType<typeof setTimeout> | null = null;

function relayKey(): string | null {
  const impl = getBridgeImpl();
  if (!impl || !impl.getPublicKey()) return null;
  return impl.currentRelayUrl.get() || null;
}

function scheduleCacheFlush(ids: Iterable<string>): void {
  for (const id of ids) dirty.add(id);
  if (dirty.size > 0 && cacheTimer === null) cacheTimer = setTimeout(flushSessionCache, CACHE_FLUSH_MS);
}

export function flushSessionCache(): void {
  if (cacheTimer !== null) { clearTimeout(cacheTimer); cacheTimer = null; }
  if (dirty.size === 0) return;
  const ids = [...dirty];
  dirty.clear();
  const relay = relayKey();
  if (!relay) return;
  const { logs } = useAppsStore.getState();
  for (const sid of ids) {
    const keep = (logs[sid] ?? []).filter((e) => e.content.length <= CACHE_EVENT_MAX_CONTENT);
    if (keep.length === 0 || keep.length > CACHE_EVENT_LIMIT) continue;
    cacheSet(relay, KIND_APP_SESSION, sid, keep);
  }
}

function validate(value: unknown): NostrEvent[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  for (const e of value as Record<string, unknown>[]) {
    if (!e || typeof e !== 'object') return null;
    if (typeof e.id !== 'string' || typeof e.pubkey !== 'string' || typeof e.content !== 'string') return null;
    if (typeof e.created_at !== 'number' || e.kind !== KIND_APP_SESSION || !Array.isArray(e.tags)) return null;
  }
  return value as NostrEvent[];
}

/** Paint a card from the cache before the relay answers. Synchronous, for layout effects. */
export function seedSessionFromCache(sessionId: string): void {
  const relay = relayKey();
  if (!relay || useAppsStore.getState().logs[sessionId]) return;
  const entry = cacheGet<unknown>(relay, KIND_APP_SESSION, sessionId);
  if (!entry) return;
  const events = validate(entry.value);
  if (!events) {
    cacheDelete(relay, KIND_APP_SESSION, sessionId);
    return;
  }
  // Straight to the store: a seed is already one batch, and a 32ms delay
  // would land after the paint it exists to beat.
  useAppsStore.getState().ingestMany(events);
}

export function resetAppsIngest(): void {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (cacheTimer !== null) { clearTimeout(cacheTimer); cacheTimer = null; }
  queue = [];
  dirty.clear();
}

// Sessions are relay state, and which ones you can see depends on the relay
// you are authenticated against — so they don't survive an account switch.
// The queue is dropped before the store, or a batch in flight lands after it.
registerClientResetHook(() => {
  resetAppsIngest();
  useAppsStore.getState().reset();
});
