/**
 * The localStorage-backed kind 0 (profile) sync cache and its bookkeeping:
 * the quiet lookup relays, the capped signed-event cache, and the per
 * `pubkey|relay` "last looked up / last synced" stamps the bridge consults
 * before it spends a REQ on a profile. Module-level and window-bound; no
 * bridge instance state.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { KIND_METADATA } from '@/utils/nip-kinds';
import { cacheFreeSpaceForQuota } from './cache';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { LACRYPTA_RELAY } from './relay-list';

// Quiet outbox/profile relays for bounded kind:0 metadata lookups. Keep this
// list intentionally small: normal channel browsing must not open persistent
// subscriptions against broad public profile relays.
export const DEFAULT_PROFILE_LOOKUP_RELAYS = [
  LACRYPTA_RELAY,
  'wss://public.obelisk.ar',
  'wss://purplepag.es',
] as const;
export const PROFILE_RELAYS = DEFAULT_PROFILE_LOOKUP_RELAYS;

export const PROFILE_SYNC_CACHE_KEY = 'obelisk/profile-sync-cache/v1';
export const PROFILE_SYNC_STATE_KEY = 'obelisk/profile-sync-state/v1';
export const PROFILE_LOOKUP_RELAYS_KEY = 'obelisk/profile-lookup-relays/v1';
export const OWN_PROFILE_LOOKUP_TTL_MS = 12 * 60 * 60 * 1000;
export const OTHER_PROFILE_LOOKUP_TTL_MS = 6 * 60 * 60 * 1000;
export const PROFILE_LOOKUP_MAX_WAIT_MS = 3500;

export interface CachedKind0Event {
  id: string;
  pubkey: string;
  created_at: number;
  content: string;
  tags: string[][];
  sig: string;
}

interface ProfileSyncCache {
  byPubkey: Record<string, CachedKind0Event>;
  /**
   * Wall-clock ms of the last accepted write per pubkey: the LRU order
   * for {@link PROFILE_SYNC_CACHE_LIMIT} eviction. Optional because
   * entries written before the cap existed have no stamp; they sort as 0
   * and are evicted first.
   */
  savedAt?: Record<string, number>;
}

/**
 * Hard cap on cached kind-0 events. `lookupExternalUserMetadata` funnels
 * EVERY profile the UI ever renders (message authors, member lists,
 * popovers, DM peers) through {@link setCachedKind0}, and full signed
 * events are ~0.5–2KB each: unbounded, this single key grew to megabytes
 * and pushed the origin's localStorage over quota. 300 entries keeps the
 * blob under ~500KB while still covering every profile a heavy account
 * sees in a session. Evicting the own profile is self-healing:
 * `syncOwnProfileToActiveRelay` re-fetches on a cache miss.
 */
export const PROFILE_SYNC_CACHE_LIMIT = 300;

function pruneProfileSyncCache(cache: ProfileSyncCache): void {
  const pubkeys = Object.keys(cache.byPubkey);
  if (pubkeys.length <= PROFILE_SYNC_CACHE_LIMIT) return;
  const savedAt = cache.savedAt ?? {};
  pubkeys.sort((a, b) => (savedAt[a] ?? 0) - (savedAt[b] ?? 0));
  for (const pk of pubkeys.slice(0, pubkeys.length - PROFILE_SYNC_CACHE_LIMIT)) {
    delete cache.byPubkey[pk];
    delete savedAt[pk];
  }
}

interface ProfileSyncState {
  ownProfileLookupAt: Record<string, number>;
  ownProfileSyncedToRelay: Record<string, number>;
}

export function profileRelayKey(pubkey: string, relay: string): string {
  return `${pubkey}|${normalizeRelayUrl(relay)}`;
}

function emptyProfileSyncCache(): ProfileSyncCache {
  return { byPubkey: {} };
}

function emptyProfileSyncState(): ProfileSyncState {
  return { ownProfileLookupAt: {}, ownProfileSyncedToRelay: {} };
}

function loadProfileSyncCache(): ProfileSyncCache {
  if (typeof window === 'undefined') return emptyProfileSyncCache();
  try {
    const raw = window.localStorage.getItem(PROFILE_SYNC_CACHE_KEY);
    if (!raw) return emptyProfileSyncCache();
    const parsed = JSON.parse(raw) as ProfileSyncCache;
    return parsed && typeof parsed === 'object' && parsed.byPubkey ? parsed : emptyProfileSyncCache();
  } catch {
    return emptyProfileSyncCache();
  }
}

function saveProfileSyncCache(cache: ProfileSyncCache): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(cache);
  try {
    window.localStorage.setItem(PROFILE_SYNC_CACHE_KEY, json);
  } catch {
    // Quota: evict disposable bridgeCache entries and retry once.
    try {
      if (cacheFreeSpaceForQuota()) window.localStorage.setItem(PROFILE_SYNC_CACHE_KEY, json);
    } catch { /* degrade silently: in-memory state is unaffected */ }
  }
}

export function loadProfileSyncState(): ProfileSyncState {
  if (typeof window === 'undefined') return emptyProfileSyncState();
  try {
    const raw = window.localStorage.getItem(PROFILE_SYNC_STATE_KEY);
    if (!raw) return emptyProfileSyncState();
    const parsed = JSON.parse(raw) as ProfileSyncState;
    return {
      ownProfileLookupAt: parsed?.ownProfileLookupAt ?? {},
      ownProfileSyncedToRelay: parsed?.ownProfileSyncedToRelay ?? {},
    };
  } catch {
    return emptyProfileSyncState();
  }
}

export function saveProfileSyncState(state: ProfileSyncState): void {
  if (typeof window === 'undefined') return;
  const json = JSON.stringify(state);
  try {
    window.localStorage.setItem(PROFILE_SYNC_STATE_KEY, json);
  } catch {
    try {
      if (cacheFreeSpaceForQuota()) window.localStorage.setItem(PROFILE_SYNC_STATE_KEY, json);
    } catch { /* degrade silently */ }
  }
}

export function getCachedKind0(pubkey: string): CachedKind0Event | null {
  return loadProfileSyncCache().byPubkey[pubkey] ?? null;
}

export function toCachedKind0(ev: NostrEvent): CachedKind0Event {
  return {
    id: ev.id,
    pubkey: ev.pubkey,
    created_at: ev.created_at,
    content: ev.content,
    tags: ev.tags.map((t) => [...t]),
    sig: ev.sig,
  };
}

export function newestEvent<T extends { created_at: number }>(events: readonly T[]): T | null {
  let newest: T | null = null;
  for (const ev of events) {
    if (!newest || ev.created_at > newest.created_at) newest = ev;
  }
  return newest;
}

export function cachedKind0ToEvent(ev: CachedKind0Event): NostrEvent {
  return { ...ev, kind: KIND_METADATA } as NostrEvent;
}

export function setCachedKind0(ev: NostrEvent | CachedKind0Event): boolean {
  const cache = loadProfileSyncCache();
  const prev = cache.byPubkey[ev.pubkey];
  if (prev && prev.created_at >= ev.created_at) return false;
  cache.byPubkey[ev.pubkey] = {
    id: ev.id,
    pubkey: ev.pubkey,
    created_at: ev.created_at,
    content: ev.content,
    tags: ev.tags.map((t) => [...t]),
    sig: ev.sig,
  };
  const savedAt = cache.savedAt ?? {};
  savedAt[ev.pubkey] = Date.now();
  cache.savedAt = savedAt;
  pruneProfileSyncCache(cache);
  saveProfileSyncCache(cache);
  return true;
}
