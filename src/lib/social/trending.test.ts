import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { trendingTags } from './trending';

const note = (id: string, pubkey: string, tags: string[]): NostrEvent => ({
  id,
  pubkey,
  kind: 1,
  content: '',
  created_at: 1,
  sig: '',
  tags: tags.map((tag) => ['t', tag]),
});

describe('trendingTags', () => {
  it('ranks by distinct authors, not raw count', () => {
    // One person posting ten times about a thing is not a trend.
    const notes = [
      note('1', 'a', ['spam']),
      note('2', 'a', ['spam']),
      note('3', 'a', ['spam']),
      note('4', 'b', ['real']),
      note('5', 'c', ['real']),
    ];
    expect(trendingTags(notes)[0]).toMatchObject({ tag: 'real', authors: 2 });
  });

  it('counts a tag once per note even if repeated inside it', () => {
    const noisy: NostrEvent = { ...note('1', 'a', []), tags: [['t', 'x'], ['t', 'X'], ['t', 'x']] };
    expect(trendingTags([noisy])[0]).toMatchObject({ tag: 'x', count: 1 });
  });

  it('drops tags everyone uses, which say nothing', () => {
    const notes = [
      note('1', 'a', ['nostr']),
      note('2', 'b', ['nostr']),
      note('3', 'c', ['bitcoin']),
    ];
    expect(trendingTags(notes).map((entry) => entry.tag)).toEqual(['bitcoin']);
  });

  it('can include the common tags when asked', () => {
    expect(trendingTags([note('1', 'a', ['nostr'])], { includeCommon: true })).toHaveLength(1);
  });

  it('is stable for ties, so the panel does not reshuffle on re-render', () => {
    const notes = [note('1', 'a', ['beta']), note('2', 'b', ['alpha'])];
    const first = trendingTags(notes).map((entry) => entry.tag);
    expect(first).toEqual(['alpha', 'beta']);
    expect(trendingTags([...notes].reverse()).map((entry) => entry.tag)).toEqual(first);
  });

  it('honours the limit', () => {
    const notes = ['a', 'b', 'c', 'd'].map((tag, i) => note(String(i), 'p', [tag]));
    expect(trendingTags(notes, { limit: 2 })).toHaveLength(2);
  });

  it('is empty when nothing is tagged', () => {
    expect(trendingTags([note('1', 'a', [])])).toEqual([]);
  });
});
