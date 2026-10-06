import { describe, expect, it } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { feedMediaItems } from '@/services/social/feed-media';

const note = (id: string, content: string, tags: string[][] = []): NostrEvent => ({
  id, pubkey: 'p'.repeat(64), kind: 1, content, tags, created_at: 1, sig: '',
});

describe('feedMediaItems', () => {
  it('gives each tile the id of the note it came from', () => {
    const items = feedMediaItems([note('n1', 'look https://example.com/a.jpg')]);
    expect(items).toEqual([
      { key: 'n1:https://example.com/a.jpg', url: 'https://example.com/a.jpg', noteId: 'n1', multiple: false },
    ]);
  });

  it('merges imeta and inline urls without duplicates and flags sets', () => {
    const items = feedMediaItems([
      note('n2', 'https://example.com/a.jpg https://example.com/b.png', [
        ['imeta', 'url https://example.com/a.jpg', 'm image/jpeg'],
      ]),
    ]);
    expect(items.map((item) => item.url)).toEqual(['https://example.com/a.jpg', 'https://example.com/b.png']);
    expect(items.every((item) => item.multiple)).toBe(true);
  });

  it('skips notes with no media', () => {
    expect(feedMediaItems([note('n3', 'just words')])).toEqual([]);
  });
});
