import type { Event as NostrEvent } from 'nostr-tools/pure';
import { setFollowSet } from './dm-cache';
import { createKeyedObservable } from '@nostr-wot/data';

interface FollowsCacheShape {
  event: NostrEvent;
  pubkeys: string[];
  lastCheckedAt: number;
}

// In-memory follow data. An empty slot means "not hydrated" (cold-start);
// a populated slot means we have a known kind-3 from localStorage or a
// fresh ingest. The cold-start contract for `dm-cache.setFollowSet` is
// preserved: `null` only flows in if `hydrateFollows` ran and found
// nothing on disk (signal: list HAS been fetched, just empty / absent).
const followsStore = createKeyedObservable<string, FollowsCacheShape>();

export function _resetFollows(): void {
  followsStore._reset();
}

/** Hook accessor — exposes the underlying observable so React hooks can
 *  bind via useSyncExternalStore. */
export function _followsStore() { return followsStore; }

function storageKey(me: string): string { return `obelisk:follows:${me}`; }

function readPersisted(me: string): FollowsCacheShape | null {
  if (typeof localStorage === 'undefined') return null;
  try { return JSON.parse(localStorage.getItem(storageKey(me)) ?? 'null'); } catch { return null; }
}

function writePersisted(me: string, shape: FollowsCacheShape): void {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.setItem(storageKey(me), JSON.stringify(shape)); } catch { /* ignore */ }
}

export function hydrateFollows(me: string): void {
  const cached = readPersisted(me);
  if (cached) {
    followsStore.set(me, cached);
    setFollowSet(me, new Set(cached.pubkeys));
  } else {
    // Hydrated, no cache → leave the observable slot empty, but signal the
    // cold-start contract to dm-cache by passing `null` (vs. never being
    // called, which is the pre-hydrate state).
    setFollowSet(me, null);
  }
}

export function ingestKind3(me: string, event: NostrEvent): void {
  if (event.kind !== 3 || event.pubkey !== me) return;
  // Pre-hydrate safety: if the in-memory slot is empty (never set), consult
  // localStorage so a live event arriving before `hydrateFollows` can't
  // overwrite a newer cached kind-3 with an older one.
  const current = followsStore.get(me).value ?? readPersisted(me);
  if (current && current.event.created_at >= event.created_at) return;
  const pubkeys = event.tags.filter((t) => t[0] === 'p' && typeof t[1] === 'string').map((t) => t[1]);
  const shape: FollowsCacheShape = { event, pubkeys, lastCheckedAt: Date.now() };
  followsStore.set(me, shape);
  writePersisted(me, shape);
  setFollowSet(me, new Set(pubkeys));
}

export function getFollowSet(me: string): Set<string> | null {
  const v = followsStore.get(me).value;
  if (!v) return null;
  return new Set(v.pubkeys);
}
