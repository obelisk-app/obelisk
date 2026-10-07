import { describe, expect, it } from 'vitest';
import { repostersLine, uniqueReposters } from '@/utils/social/reposters';

describe('uniqueReposters', () => {
  it('puts the row author first and lists everyone once', () => {
    expect(uniqueReposters('a', ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(uniqueReposters('a', undefined)).toEqual(['a']);
  });
});

describe('repostersLine', () => {
  it('names two and counts the rest', () => {
    expect(repostersLine(['a', 'b', 'c', 'd'])).toEqual({ shown: ['a', 'b'], rest: 2 });
    expect(repostersLine(['a'])).toEqual({ shown: ['a'], rest: 0 });
  });
});
