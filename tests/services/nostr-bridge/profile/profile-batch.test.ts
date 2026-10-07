import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { ProfileBatcher } from '@/services/nostr-bridge/profile/profile-batch';
import { ProfileLookup } from '@/services/nostr-bridge/profile/profile-lookup';
import type { TrackedSub } from '@/services/nostr-bridge/facade/context';

const pk = (i: number) => i.toString(16).padStart(64, '0');

function batcher() {
  const reqs: Filter[] = [];
  const lookups: Array<readonly string[]> = [];
  const b = new ProfileBatcher(
    {
      relays: () => ['wss://r.example'],
      subscribeWatched: (_relays, filter) => { reqs.push(filter); return { close: vi.fn() } satisfies TrackedSub; },
      track: vi.fn(),
      closeTracked: vi.fn(),
    },
    { ingest: vi.fn(), lookupExternal: async (authors) => { lookups.push(authors); } },
  );
  return { b, reqs, lookups };
}

describe('profile-batch', () => {
  afterEach(() => vi.useRealTimers());

  it('coalesces one frame of pubkeys into one REQ and one lookup', () => {
    vi.useFakeTimers();
    const { b, reqs, lookups } = batcher();
    b.queue(pk(1));
    b.queue(pk(2));
    b.queue(pk(1));
    expect(reqs).toHaveLength(0);
    vi.advanceTimersByTime(16);
    expect(reqs).toEqual([{ kinds: [0], authors: [pk(1), pk(2)] }]);
    expect(lookups).toEqual([[pk(1), pk(2)]]);
  });

  it('sends a full batch of 100 at once, and clear drops what is queued', () => {
    vi.useFakeTimers();
    const { b, reqs } = batcher();
    for (let i = 0; i < 100; i++) b.queue(pk(i));
    expect(reqs).toHaveLength(1);
    b.queue(pk(500));
    b.clear();
    vi.advanceTimersByTime(100);
    expect(reqs).toHaveLength(1);
  });
});

describe('profile-lookup', () => {
  it('skips a pubkey inside its TTL or on the negative cooldown, and marks a confirmed miss', async () => {
    let now = 1_800_000_000_000;
    const found: NostrEvent = { id: 'e', pubkey: pk(1), kind: 0, created_at: 5, content: '{}', tags: [], sig: '' };
    const query = vi.fn(async (_relays: readonly string[], filters: readonly Filter[], _maxWait: number) => ({
      perFilter: filters.map((f) => (f.authors?.includes(found.pubkey) ? [found] : [])),
      complete: true,
    }));
    const missing = new Set<string>([pk(3)]);
    const deps = { now: () => now, isMissing: (p: string) => missing.has(p), markMissing: (p: string) => { missing.add(p); }, ingest: vi.fn() };
    const lookup = new ProfileLookup({ session: () => null, queryAuthorsWithConfidence: query }, deps, 5000);
    await lookup.lookup([pk(1), pk(2), pk(3)]);
    expect(query).toHaveBeenCalledTimes(1);
    // One filter per author, each with its own revision budget; the hub merges them on the wire.
    expect(query.mock.calls[0]?.[1]).toEqual([
      { kinds: [0], authors: [pk(1)], limit: 5 },
      { kinds: [0], authors: [pk(2)], limit: 5 },
    ]);
    expect(deps.ingest).toHaveBeenCalledWith(found);
    expect(missing.has(pk(2))).toBe(true);
    now += 1000;
    await lookup.lookup([pk(1), pk(2)]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
