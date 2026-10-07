import { afterEach, describe, expect, it } from 'vitest';
import { cacheGet, cacheSet } from '@/services/nostr-bridge/cache/cache';
import { cacheClearAll, cacheDelete, cacheFreeSpaceForQuota, cacheListIdsByKind } from '@/services/nostr-bridge/cache/cache-sweep';
import { KEY_PREFIX } from '@/constants/nostr-bridge/cache';

const A = 'wss://a.example';
const B = 'wss://b.example';

describe('cache-sweep', () => {
  afterEach(() => window.localStorage.clear());

  it('deletes one entry, one kind, or one relay', () => {
    cacheSet(A, 1, 'x', 1);
    cacheSet(A, 1, 'y', 1);
    cacheSet(A, 2, 'z', 1);
    cacheSet(B, 1, 'x', 1);
    cacheDelete(A, 1, 'x');
    expect(cacheGet(A, 1, 'x')).toBeNull();
    cacheDelete(A, 1);
    expect(cacheListIdsByKind(A, [1, 2])).toEqual(new Map([[2, ['z']]]));
    cacheDelete(A);
    expect(cacheListIdsByKind(A, [2]).size).toBe(0);
    expect(cacheGet(B, 1, 'x')?.value).toBe(1);
  });

  it('frees the oldest half on a quota error, and the logout wipe takes legacy generations too', () => {
    for (let i = 0; i < 4; i++) {
      window.localStorage.setItem(`${KEY_PREFIX}${A}/1/${i}`, JSON.stringify({ v: i, t: 1000 + i }));
    }
    expect(cacheFreeSpaceForQuota()).toBe(true);
    expect(cacheListIdsByKind(A, [1]).get(1)?.sort()).toEqual(['2', '3']);
    window.localStorage.setItem('obelisk-cache-v3/old', '1');
    window.localStorage.setItem('unrelated', '1');
    cacheClearAll();
    expect(window.localStorage.getItem('obelisk-cache-v3/old')).toBeNull();
    expect(window.localStorage.getItem('unrelated')).toBe('1');
    expect(cacheFreeSpaceForQuota()).toBe(false);
  });
});
