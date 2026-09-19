import { beforeEach, describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  FEED_CACHE_LIMIT,
  flushFeedCacheWrites,
  profileFeedId,
  readFeedCache,
  seedFromCache,
  writeFeedCache,
} from './cache';

const RELAYS = ['wss://a.example', 'wss://b.example'];

const note = (id: string, createdAt: number): NostrEvent => ({
  id,
  pubkey: 'pk',
  content: `note ${id}`,
  created_at: createdAt,
  tags: [],
  kind: 1,
  sig: 'sig-should-not-be-stored',
});

beforeEach(() => {
  window.localStorage.clear();
});

describe('feed cache', () => {
  it('round-trips notes so a re-opened feed paints instantly', () => {
    // This is the whole point: before this, every mount started empty and
    // refetched from zero.
    writeFeedCache(RELAYS, 'feed:global', [note('a', 200), note('b', 100)]);
    flushFeedCacheWrites();
    expect(readFeedCache(RELAYS, 'feed:global').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('keys by relay set, so switching relays does not serve stale notes', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('a', 100)]);
    flushFeedCacheWrites();
    expect(readFeedCache(['wss://other.example'], 'feed:global')).toEqual([]);
  });

  it('is order-independent in the relay key', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('a', 100)]);
    flushFeedCacheWrites();
    expect(readFeedCache([...RELAYS].reverse(), 'feed:global')).toHaveLength(1);
  });

  it('keeps following, global and per-profile feeds separate', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('g', 100)]);
    writeFeedCache(RELAYS, 'feed:following', [note('f', 100)]);
    writeFeedCache(RELAYS, profileFeedId('pk1'), [note('p', 100)]);
    flushFeedCacheWrites();
    expect(readFeedCache(RELAYS, 'feed:global').map((n) => n.id)).toEqual(['g']);
    expect(readFeedCache(RELAYS, 'feed:following').map((n) => n.id)).toEqual(['f']);
    expect(readFeedCache(RELAYS, profileFeedId('pk1')).map((n) => n.id)).toEqual(['p']);
  });

  it('caps what it stores', () => {
    const many = Array.from({ length: FEED_CACHE_LIMIT + 25 }, (_, i) => note(`n${i}`, 1000 - i));
    writeFeedCache(RELAYS, 'feed:global', many);
    flushFeedCacheWrites();
    expect(readFeedCache(RELAYS, 'feed:global')).toHaveLength(FEED_CACHE_LIMIT);
  });

  it('does not store signatures', () => {
    // Nothing re-verifies a cached note, and sig roughly doubles the payload
    // on a quota-limited origin.
    writeFeedCache(RELAYS, 'feed:global', [note('a', 100)]);
    flushFeedCacheWrites();
    const raw = JSON.stringify(window.localStorage);
    expect(raw).not.toContain('sig-should-not-be-stored');
  });

  it('writes are debounced — nothing lands before the flush', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('a', 100)]);
    expect(readFeedCache(RELAYS, 'feed:global')).toEqual([]);
    flushFeedCacheWrites();
    expect(readFeedCache(RELAYS, 'feed:global')).toHaveLength(1);
  });

  it('seeds and merges with whatever is already in memory', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('cached', 100)]);
    flushFeedCacheWrites();
    const seeded = seedFromCache(RELAYS, 'feed:global', [note('live', 200)]);
    expect(seeded.map((n) => n.id)).toEqual(['live', 'cached']);
  });

  it('survives a corrupt entry rather than throwing', () => {
    writeFeedCache(RELAYS, 'feed:global', [note('a', 100)]);
    flushFeedCacheWrites();
    const key = Object.keys(window.localStorage).find((k) => k.includes('social:'));
    window.localStorage.setItem(key!, '{not json');
    expect(readFeedCache(RELAYS, 'feed:global')).toEqual([]);
  });
});
