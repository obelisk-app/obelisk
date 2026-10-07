import { describe, expect, it } from 'vitest';
import { mergeUserHits } from '@/utils/identity/user-hits';

const hit = (c: string) => ({ pubkey: c.repeat(64), displayName: c });

describe('mergeUserHits', () => {
  it('puts the decoded key first, then the NIP-05 hit, then name matches, each once', () => {
    const merged = mergeUserHits(hit('a'), hit('b'), [hit('b'), hit('c'), hit('a')]);
    expect(merged.map((h) => h.displayName)).toEqual(['a', 'b', 'c']);
  });

  it('keeps the first hit of a pubkey and skips the missing ones', () => {
    const first = { pubkey: 'a'.repeat(64), displayName: 'first' };
    const later = { pubkey: 'a'.repeat(64), displayName: 'later' };
    expect(mergeUserHits(null, undefined, [first, later])).toEqual([first]);
  });

  it('lists every hit by default and at most `limit` when given', () => {
    const many = 'cdefghijklmn'.split('').map(hit);
    expect(mergeUserHits(null, null, many)).toHaveLength(12);
    expect(mergeUserHits(null, null, many, 3).map((h) => h.displayName)).toEqual(['c', 'd', 'e']);
  });
});
