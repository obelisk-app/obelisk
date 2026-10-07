/**
 * The bounded TTL verdict cache: refreshes move to the back, lapsed entries
 * are evicted before current ones, and counts ignore lapsed entries.
 */
import { describe, expect, it } from 'vitest';
import { VerdictCache } from '@/services/wot/verdict-cache';
import { DEFAULT_MAX_CACHE_ENTRIES } from '@/constants/wot/verdict-cache';

const allow = (expiresAt: number) => ({ verdict: 'allow' as const, distance: 1, expiresAt });
const deny = (expiresAt: number) => ({ verdict: 'deny' as const, distance: null, expiresAt });

describe('VerdictCache', () => {
  it('defaults to the 10,000 entry ceiling and never goes below one', () => {
    expect(new VerdictCache().maxEntries).toBe(DEFAULT_MAX_CACHE_ENTRIES);
    expect(DEFAULT_MAX_CACHE_ENTRIES).toBe(10_000);
    expect(new VerdictCache(0).maxEntries).toBe(1);
  });

  it('evicts the least recently resolved first, and a refresh moves a key to the back', () => {
    const cache = new VerdictCache(2);
    cache.set('a', allow(100));
    cache.set('b', allow(100));
    cache.set('a', allow(200));
    cache.makeRoom(1, 0);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')?.expiresAt).toBe(200);
  });

  it('evicts lapsed entries before current ones', () => {
    const cache = new VerdictCache(2);
    cache.set('current', allow(100));
    cache.set('lapsed', deny(10));
    cache.makeRoom(1, 50);
    expect(cache.get('current')).toBeDefined();
    expect(cache.get('lapsed')).toBeUndefined();
  });

  it('counts and freshness ignore lapsed entries', () => {
    const cache = new VerdictCache();
    cache.set('a', allow(100));
    cache.set('b', deny(100));
    cache.set('c', deny(10));
    expect(cache.counts(50)).toEqual({ allow: 1, deny: 1 });
    expect(cache.isFresh('a', 50)).toBe(true);
    expect(cache.isFresh('c', 50)).toBe(false);
    expect(cache.isFresh('missing', 50)).toBe(false);
  });
});
