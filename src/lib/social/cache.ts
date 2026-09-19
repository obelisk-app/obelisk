/**
 * Feed caching — the thing the profile feed has never had.
 *
 * Until now every feed mount started from an empty array and refetched from
 * the relays, and `NostrProfile` was keyed `${pubkey}:${relays}` so even
 * navigating away and back threw the notes away. The shipped i18n string said
 * as much: "feed events are not cached".
 *
 * This is the standard bridgeCache stale-while-revalidate contract from
 * CLAUDE.md: seed synchronously before first paint, write through on ingest
 * with a debounce, cap the stored slice. Entries live under
 * `obelisk-cache-v4/<socialRelayKey>/1/<feedId>`, so the existing
 * "Clear cache" prefix sweep already covers them.
 */

import type { Event as NostrEvent } from 'nostr-tools';
import { cacheGet, cacheSet } from '../nostr-bridge/cache';
import { KIND_TEXT_NOTE } from '../nip-kinds';
import { mergeNotes } from './feed';
import { socialRelayKey } from './relays';

/**
 * Keep this well below the in-memory `FEED_MAX_NOTES`. localStorage is a
 * shared, quota-limited origin resource — the kind-0 profile blob already
 * competes for it — and 50 notes is plenty to fill a viewport instantly
 * while the live query catches up.
 */
export const FEED_CACHE_LIMIT = 50;

const WRITE_DEBOUNCE_MS = 200;

export type FeedCacheId = `feed:following` | `feed:global` | `profile:${string}`;

export function profileFeedId(pubkey: string): FeedCacheId {
  return `profile:${pubkey}`;
}

/**
 * Only the fields a rendered note needs. Storing whole events (with `sig`)
 * would roughly double the payload for no benefit — nothing re-verifies a
 * signature on read, and a cached note is replaced by the relay copy within
 * a second anyway.
 */
type CachedNote = {
  id: string;
  pubkey: string;
  content: string;
  created_at: number;
  tags: string[][];
  kind: number;
};

function toCached(note: NostrEvent): CachedNote {
  return {
    id: note.id,
    pubkey: note.pubkey,
    content: note.content,
    created_at: note.created_at,
    tags: note.tags,
    kind: note.kind,
  };
}

function fromCached(note: CachedNote): NostrEvent {
  return { ...note, sig: '' } as NostrEvent;
}

function isCachedNote(value: unknown): value is CachedNote {
  const note = value as CachedNote | null;
  return !!note
    && typeof note.id === 'string'
    && typeof note.pubkey === 'string'
    && typeof note.content === 'string'
    && typeof note.created_at === 'number'
    && Array.isArray(note.tags);
}

/** Synchronous seed — call from a layout effect, before first paint. */
export function readFeedCache(
  relays: readonly string[],
  id: FeedCacheId,
): NostrEvent[] {
  const entry = cacheGet<CachedNote[]>(socialRelayKey(relays), KIND_TEXT_NOTE, id);
  if (!entry || !Array.isArray(entry.value)) return [];
  return entry.value.filter(isCachedNote).map(fromCached);
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, NostrEvent[]>();

/**
 * Debounced write-through. A feed streams events one at a time, so writing on
 * every arrival would serialize the whole list dozens of times per second.
 */
export function writeFeedCache(
  relays: readonly string[],
  id: FeedCacheId,
  notes: readonly NostrEvent[],
): void {
  const relayKey = socialRelayKey(relays);
  const key = `${relayKey}|${id}`;
  pending.set(key, notes.slice(0, FEED_CACHE_LIMIT));
  if (timers.has(key)) return;
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    const latest = pending.get(key);
    pending.delete(key);
    if (!latest) return;
    cacheSet(relayKey, KIND_TEXT_NOTE, id, latest.map(toCached));
  }, WRITE_DEBOUNCE_MS));
}

/** Seed + merge in one step, for the common mount path. */
export function seedFromCache(
  relays: readonly string[],
  id: FeedCacheId,
  current: readonly NostrEvent[] = [],
): NostrEvent[] {
  return mergeNotes(current, readFeedCache(relays, id));
}

/** Test/teardown helper — flushes pending writes so assertions are stable. */
export function flushFeedCacheWrites(): void {
  for (const [key, timer] of timers) {
    clearTimeout(timer);
    timers.delete(key);
    const latest = pending.get(key);
    pending.delete(key);
    if (!latest) continue;
    const [relayKey, id] = key.split('|');
    cacheSet(relayKey, KIND_TEXT_NOTE, id, latest.map(toCached));
  }
}
