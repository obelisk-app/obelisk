import { describe, expect, it } from 'vitest';
import { addressSlug, hashtagOfHref, noteSnippet, noteViewerHref } from '@/utils/social/note-refs';

describe('note reference shaping', () => {
  it('reads a timestamped identifier as words', () => {
    expect(addressSlug('1712000000-why-nostr')).toBe('why nostr');
    expect(addressSlug('my_post__draft')).toBe('my post draft');
    expect(addressSlug('')).toBe('');
  });

  it('links to the note viewer without the nostr: prefix', () => {
    expect(noteViewerHref('nostr:naddr1abc')).toBe('/notes/naddr1abc');
    expect(noteViewerHref('naddr1abc')).toBe('/notes/naddr1abc');
  });

  it('puts a note on one line', () => {
    expect(noteSnippet('gm \n\n  all ')).toBe('gm all');
    expect(noteSnippet(undefined)).toBeUndefined();
  });

  it('finds the tag of an in-app hashtag link only', () => {
    expect(hashtagOfHref('/t/bitcoin')).toBe('bitcoin');
    expect(hashtagOfHref('/t/caf%C3%A9')).toBe('caf%C3%A9');
    expect(hashtagOfHref('/t/a/b')).toBeUndefined();
    expect(hashtagOfHref('https://example.com/t/x')).toBeUndefined();
    expect(hashtagOfHref(null)).toBeUndefined();
  });
});
