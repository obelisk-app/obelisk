import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { dmTagExtras, getAllTags, getTag } from '@/services/nostr-bridge/event-tags';

function ev(tags: string[][]): NostrEvent {
  return { id: 'id', pubkey: 'pk', created_at: 0, kind: 9, content: '', sig: 'sig', tags };
}

describe('getTag', () => {
  it('returns the value of the first matching tag', () => {
    expect(getTag(ev([['h', 'a'], ['h', 'b']]), 'h')).toBe('a');
  });

  it('returns undefined when the tag is absent or has no value', () => {
    expect(getTag(ev([['p', 'x']]), 'h')).toBeUndefined();
    expect(getTag(ev([['h']]), 'h')).toBeUndefined();
  });
});

describe('getAllTags', () => {
  it('returns every value in document order, skipping empty ones', () => {
    expect(getAllTags(ev([['p', 'a'], ['e', 'x'], ['p', ''], ['p'], ['p', 'b']]), 'p')).toEqual(['a', 'b']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(getAllTags(ev([]), 'p')).toEqual([]);
  });
});

describe('dmTagExtras', () => {
  it('returns an empty object when there are no tags', () => {
    expect(dmTagExtras('hello', [])).toEqual({});
  });

  it('surfaces custom emoji only when an emoji tag is present', () => {
    const extras = dmTagExtras('hi :wave:', [['emoji', 'wave', 'https://x/wave.png']]);
    expect(extras.customEmojis).toEqual({ wave: 'https://x/wave.png' });
    expect(extras).not.toHaveProperty('sticker');
  });

  it('omits both fields for unrelated tags', () => {
    expect(dmTagExtras('hi', [['p', 'abc']])).toEqual({});
  });
});
