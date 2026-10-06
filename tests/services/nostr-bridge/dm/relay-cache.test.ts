import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RELAY_LIST_CACHE_MAX, RELAY_LIST_NEGATIVE_TTL_MS, RELAY_LIST_TTL_MS, RelayListCache } from '@/services/nostr-bridge/dm/relay-cache';

const pk = (i: number) => i.toString(16).padStart(64, '0');

describe('RelayListCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays at 1,000 entries under 5,000 inserts, oldest out first', () => {
    const cache = new RelayListCache({ now: () => Date.now() });
    for (let i = 0; i < 5000; i++) cache.set(pk(i), ['wss://r.example']);
    expect(cache.size).toBe(RELAY_LIST_CACHE_MAX);
    expect(cache.get(pk(0))).toBeUndefined();
    expect(cache.get(pk(4999))).toEqual(['wss://r.example']);
  });

  it('keeps a found list for six hours and a cached "none" for fifteen minutes', () => {
    const cache = new RelayListCache({ now: () => Date.now() });
    cache.set(pk(1), ['wss://r.example']);
    cache.set(pk(2), []);
    expect(cache.get(pk(2))).toEqual([]);
    vi.advanceTimersByTime(RELAY_LIST_NEGATIVE_TTL_MS);
    expect(cache.get(pk(2))).toBeUndefined();
    expect(cache.get(pk(1))).toEqual(['wss://r.example']);
    vi.advanceTimersByTime(RELAY_LIST_TTL_MS - RELAY_LIST_NEGATIVE_TTL_MS);
    expect(cache.get(pk(1))).toBeUndefined();
  });
});
