'use client';

/**
 * Profile metadata for feed authors.
 *
 * The feed was resolving names through the bridge's `useUserMetadata`, which
 * queries `DEFAULT_PROFILE_LOOKUP_RELAYS`: lacrypta, public.obelisk.ar,
 * purplepag.es. Those are the *group* tier: they hold the profiles of people
 * in your NIP-29 rooms. Someone you follow on the wider network has no reason
 * to have published their kind 0 there, so the feed showed a truncated npub
 * for half the people in it, including direct follows.
 *
 * This resolves over the **social** relays plus the profile aggregators, and
 * caches the result. Three layers, cheapest first:
 *
 *   1. in-memory observable   - shared across every card showing that author
 *   2. localStorage           - survives reload, painted before any query
 *   3. one batched REQ        - `{kinds:[0], authors:[...]}`, chunked
 *
 * Batching matters: a feed page has ~50 distinct authors, and 50 separate
 * `fetchProfile` calls would be 50 round trips for data that fits in one
 * filter.
 */

import { registerRuntimeCache } from '@/services/local-data/runtime-caches';
import { chunkItems } from '@/utils/common/arrays';
import { createKeyedObservable, getProfileAggregators, parseKind0 } from '@nostr-wot/data';
import type { Event as NostrEvent } from 'nostr-tools';
import { cacheGet, cacheSet } from '@/services/nostr-bridge';
import { querySocial, socialRelays } from './pool';
import { KIND_METADATA } from '@/constants/nostr/nip-kinds';

export type SocialProfile = {
  pubkey: string;
  name: string | null;
  displayName: string | null;
  picture: string | null;
  banner: string | null;
  about: string | null;
  nip05: string | null;
  lud16: string | null;
  /** When we last resolved it, for TTL. */
  fetchedAt: number;
};

/**
 * Profiles are identity-scoped, not relay-scoped: the same pubkey has the
 * same kind 0 whichever relay served it. So unlike feeds, this cache uses one
 * fixed namespace rather than keying on the relay set; otherwise changing
 * relays would needlessly discard every name you'd already resolved.
 */
const CACHE_NS = 'social-profiles';
/** Names change rarely; a day avoids re-querying on every session. */
const TTL_MS = 24 * 60 * 60 * 1000;
/** Relays cap filter values; a big feed page can exceed a naive single REQ. */
const AUTHORS_PER_QUERY = 200;

const store = createKeyedObservable<string, SocialProfile>({
  equal: (a, b) => a.fetchedAt === b.fetchedAt,
});

const inFlight = new Map<string, number>();
const subscribers = new Map<string, number>();
let generation = 0;
let cachedEntries = 0;
let seedFromPersistence = true;

function remember(profile: SocialProfile): void {
  if (!store.get(profile.pubkey).value) cachedEntries++;
  store.set(profile.pubkey, profile);
}

registerRuntimeCache({
  id: 'social-profiles', category: 'profiles', scope: 'public', sensitive: false,
  inspect: () => ({ entries: cachedEntries, pending: inFlight.size }),
  invalidate: (reason) => {
    generation++;
    inFlight.clear();
    cachedEntries = 0;
    // Notifications may synchronously read again before category removal deletes disk entries.
    // A manual clear also promises a fresh lookup, rather than reseeding yesterday's profile.
    seedFromPersistence = false;
    store.clear();
    if (reason === 'manual') void ensureSocialProfiles([...subscribers.keys()]);
  },
});

function fromEvent(event: NostrEvent): SocialProfile {
  // `parseKind0` handles the display_name/displayName split and the fact that
  // kind-0 content is arbitrary user JSON that may not parse at all.
  const entry = parseKind0(event) as Partial<SocialProfile> & { pubkey: string };
  return {
    pubkey: event.pubkey,
    name: entry.name ?? null,
    displayName: entry.displayName ?? null,
    picture: entry.picture ?? null,
    banner: entry.banner ?? null,
    about: entry.about ?? null,
    nip05: entry.nip05 ?? null,
    lud16: entry.lud16 ?? null,
    fetchedAt: Date.now(),
  };
}

function readCache(pubkey: string): SocialProfile | null {
  const entry = cacheGet<SocialProfile>(CACHE_NS, KIND_METADATA, pubkey);
  if (!entry?.value || typeof entry.value.pubkey !== 'string') return null;
  return entry.value;
}

function writeCache(profile: SocialProfile): void {
  cacheSet(CACHE_NS, KIND_METADATA, profile.pubkey, profile);
}

function isFresh(profile: SocialProfile | null): boolean {
  return !!profile && profile.fetchedAt > 0 && Date.now() - profile.fetchedAt < TTL_MS;
}

/** Synchronous read: memory, then localStorage. Never queries. */
export function getSocialProfile(pubkey: string): SocialProfile | null {
  const known = store.get(pubkey).value;
  if (known) return known;
  const cached = seedFromPersistence ? readCache(pubkey) : null;
  if (cached) {
    remember(cached);
    return cached;
  }
  return null;
}

/**
 * Resolve any of `pubkeys` we don't already have fresh. Safe to call on every
 * render of a feed page: it filters to what's actually missing first.
 */
export async function ensureSocialProfiles(pubkeys: readonly string[]): Promise<void> {
  const wanted = [...new Set(pubkeys)].filter((pubkey) => {
    if (!/^[0-9a-f]{64}$/i.test(pubkey)) return false;
    if (inFlight.has(pubkey)) return false;
    return !isFresh(getSocialProfile(pubkey));
  });
  if (wanted.length === 0) return;

  const owner = generation;
  wanted.forEach((pubkey) => inFlight.set(pubkey, owner));
  // Aggregators exist precisely for kind-0 lookup, so ask them alongside the
  // user's own relays rather than instead of them.
  const relays = [...new Set([...socialRelays(), ...getProfileAggregators()])];

  try {
    await Promise.all(chunkItems(wanted, AUTHORS_PER_QUERY).map(async (authors) => {
      const events = await querySocial([{ kinds: [KIND_METADATA], authors }], { relays });
      if (owner !== generation) return;
      // Newest kind 0 wins; a pubkey legitimately has several in flight.
      const newest = new Map<string, NostrEvent>();
      for (const event of events) {
        const existing = newest.get(event.pubkey);
        if (!existing || event.created_at > existing.created_at) newest.set(event.pubkey, event);
      }
      for (const event of newest.values()) {
        if (owner !== generation) return;
        const profile = fromEvent(event);
        remember(profile);
        if (owner === generation) writeCache(profile);
      }
    }));
  } catch {
    // A name is decoration: a failed lookup should leave the npub fallback
    // in place, not break the row.
  } finally {
    wanted.forEach((pubkey) => {
      if (inFlight.get(pubkey) === owner) inFlight.delete(pubkey);
    });
  }
}

/**
 * Listen for one author's profile resolving or changing. Returns an
 * unsubscribe. The React side is `useSocialProfile` in `src/hooks/social/`.
 */
export function subscribeSocialProfile(pubkey: string, onChange: (profile: SocialProfile | null) => void): () => void {
  subscribers.set(pubkey, (subscribers.get(pubkey) ?? 0) + 1);
  const unsubscribe = store.subscribe(pubkey, (slot) => onChange(slot.value ?? null));
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    unsubscribe();
    const remaining = (subscribers.get(pubkey) ?? 1) - 1;
    if (remaining > 0) subscribers.set(pubkey, remaining);
    else subscribers.delete(pubkey);
  };
}

/** Test helper. */
export function _resetSocialProfiles(): void {
  generation++;
  store._reset();
  inFlight.clear();
  subscribers.clear();
  cachedEntries = 0;
  seedFromPersistence = true;
}
