/**
 * The plain feed-source helpers `useFeed` keys, caches and tails by.
 */
import { describe, expect, it } from 'vitest';
import { FOLLOWING_FEED_ID, GLOBAL_FEED_ID, profileFeedId } from '@/services/social/cache';
import { kindsForFilter } from '@/services/social/kinds';
import { authorsFingerprint, cacheIdFor, liveTailFilters, sourceKey } from '@/services/social/feed-source';

const pk = (c: string) => c.repeat(64);

describe('feed source helpers', () => {
  it('maps each source to its cache slot', () => {
    expect(cacheIdFor({ kind: 'global' })).toBe(GLOBAL_FEED_ID);
    expect(cacheIdFor({ kind: 'following', authors: [] })).toBe(FOLLOWING_FEED_ID);
    expect(cacheIdFor({ kind: 'profile', pubkey: pk('a') })).toBe(profileFeedId(pk('a')));
  });

  it('keys Following by follow-list content, not just its length', () => {
    const before = sourceKey({ kind: 'following', authors: [pk('a'), pk('b')] });
    const swapped = sourceKey({ kind: 'following', authors: [pk('a'), pk('c')] });
    expect(before).not.toBe(swapped);
    expect(before.startsWith('following:2:')).toBe(true);
    expect(authorsFingerprint([pk('a'), pk('b')])).toBe(authorsFingerprint([pk('a'), pk('b')]));
    expect(sourceKey({ kind: 'global' })).toBe('global');
    expect(sourceKey({ kind: 'profile', pubkey: pk('a') })).toBe(`profile:${pk('a')}`);
  });

  it('tails new notes only, capping a Following tail at 300 authors', () => {
    const kinds = kindsForFilter('all');
    expect(liveTailFilters({ kind: 'global' }, 'all', 100)).toEqual([{ kinds, since: 100 }]);
    expect(liveTailFilters({ kind: 'profile', pubkey: pk('a') }, 'all', 100)).toEqual([{ kinds, authors: [pk('a')], since: 100 }]);
    const many = Array.from({ length: 350 }, (_, i) => i.toString(16).padStart(64, '0'));
    const [following] = liveTailFilters({ kind: 'following', authors: many }, 'all', 100);
    expect(following?.authors).toHaveLength(300);
    expect(following?.since).toBe(100);
  });
});
