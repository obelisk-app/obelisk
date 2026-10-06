/**
 * The profile cache's bounds, as the RelayHub design's step 8 asks them to
 * be proven: N inserts well above the cap leave the cache and the derived
 * `userMetadata` view at the cap; the hidden-tab trim reaches the view; a
 * lookup that completes with no kind 0 is not refetched inside the
 * negative cooldown and is after it; a found profile is not refetched
 * inside its TTL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { OTHER_PROFILE_LOOKUP_TTL_MS } from '@/services/nostr-bridge/profile-sync-cache';
import { ProfilesModule, type ProfilesContext } from '@/services/nostr-bridge/profiles';
import { StateStore } from '@/services/nostr-bridge/state-store';
import type { TrackedSub } from '@/services/nostr-bridge/context';

const pk = (i: number) => i.toString(16).padStart(64, '0');
const kind0 = (pubkey: string, createdAt = 1_700_000_000): NostrEvent => ({
  id: pubkey.slice(0, 32) + createdAt.toString(16).padStart(32, '0'),
  pubkey,
  kind: 0,
  created_at: createdAt,
  tags: [],
  content: JSON.stringify({ name: `u-${pubkey.slice(0, 6)}` }),
  sig: 'c'.repeat(128),
});

interface Harness {
  profiles: ProfilesModule;
  /** The external lookup: one batched per-author read per lookup round. */
  query: ReturnType<typeof vi.fn<ProfilesContext['queryAuthorsWithConfidence']>>;
  visibility: { hidden: boolean; set(hidden: boolean): void };
}

function makeProfiles(opts: { complete?: boolean; found?: readonly string[] } = {}): Harness {
  const listeners = new Set<() => void>();
  const visibility = {
    hidden: false,
    isHidden: () => visibility.hidden,
    onChange: (cb: () => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    set: (hidden: boolean) => {
      visibility.hidden = hidden;
      for (const cb of Array.from(listeners)) cb();
    },
  };
  const query = vi.fn<ProfilesContext['queryAuthorsWithConfidence']>(async (_relays, filters: readonly Filter[]) => ({
    perFilter: filters.map((filter) => (filter.authors ?? []).filter((a) => opts.found?.includes(a)).map((a) => kind0(a))),
    complete: opts.complete ?? true,
  }));
  const ctx: ProfilesContext = {
    session: () => ({ pubKeyHex: pk(999_999), loginMethod: 'nsec', privKeyHex: '', relayUrl: 'wss://a.example' }),
    relays: () => ['wss://a.example'],
    currentRelayUrl: new StateStore('wss://a.example'),
    subscribeWatched: (): TrackedSub => ({ close: () => undefined }),
    track: () => undefined,
    closeTracked: () => undefined,
    queryRelaysWithConfidence: async () => ({ events: [], complete: true }),
    queryAuthorsWithConfidence: query,
    signAndPublish: () => Promise.reject(new Error('not under test')),
  };
  const profiles = new ProfilesModule(ctx, { publishSignedEventToRelays: async () => [] }, { visibility });
  return { profiles, query, visibility };
}

describe('ProfilesModule', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });
  afterEach(() => vi.useRealTimers());

  it('stays at 5,000 profiles under 6,000 ingests, and the userMetadata view shrinks with the cache', async () => {
    const { profiles } = makeProfiles();
    for (let i = 0; i < 6000; i++) profiles.ingest(kind0(pk(i)), { cacheRelayScoped: false });
    await Promise.resolve();
    expect(profiles.stats().size).toBe(5000);
    const view = profiles.userMetadata.get();
    expect(Object.keys(view)).toHaveLength(5000);
    expect(view[pk(0)]).toBeUndefined();   // the oldest, never read, is gone
    expect(view[pk(5999)]).toBeDefined();
    profiles.dispose();
  });

  it('trims to 2,000 after five hidden minutes, keeping what was read, and the view follows', async () => {
    const { profiles, visibility } = makeProfiles();
    for (let i = 0; i < 5000; i++) profiles.ingest(kind0(pk(i)), { cacheRelayScoped: false });
    profiles.ensure(pk(0)); // on screen: the LRU's recency signal
    visibility.set(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(profiles.stats()).toMatchObject({ size: 2000, trims: 1 });
    const view = profiles.userMetadata.get();
    expect(Object.keys(view)).toHaveLength(2000);
    expect(view[pk(0)]).toBeDefined();
    expect(view[pk(1)]).toBeUndefined();
    profiles.dispose();
  });

  it('does not refetch a complete miss inside the negative cooldown, and does after it', async () => {
    const { profiles, query } = makeProfiles({ complete: true, found: [] });
    await profiles.lookupExternal([pk(1)]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(profiles.stats().negative).toBe(1);
    await profiles.lookupExternal([pk(1)]);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000 - 1);
    await profiles.lookupExternal([pk(1)]);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await profiles.lookupExternal([pk(1)]);
    expect(query).toHaveBeenCalledTimes(2);
    profiles.dispose();
  });

  it('an incomplete lookup (a timeout) is not a miss: the next lookup goes to the wire', async () => {
    const { profiles, query } = makeProfiles({ complete: false, found: [] });
    await profiles.lookupExternal([pk(1)]);
    await profiles.lookupExternal([pk(1)]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(profiles.stats().negative).toBe(0);
    profiles.dispose();
  });

  it('does not refetch a found profile inside its TTL, and the find clears a negative mark', async () => {
    const { profiles, query } = makeProfiles({ complete: true, found: [pk(2)] });
    await profiles.lookupExternal([pk(2)]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(profiles.userMetadata.get()[pk(2)]?.name).toBe(`u-${pk(2).slice(0, 6)}`);
    await vi.advanceTimersByTimeAsync(OTHER_PROFILE_LOOKUP_TTL_MS - 1);
    await profiles.lookupExternal([pk(2)]);
    expect(query).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await profiles.lookupExternal([pk(2)]);
    expect(query).toHaveBeenCalledTimes(2);
    profiles.dispose();
  });
});
