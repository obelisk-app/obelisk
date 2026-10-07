import { describe, expect, it } from 'vitest';
import { buildGifSelections } from '@/utils/media/library/gif-selections';
import type { JsMediaPack } from '@/services/nostr-bridge';

describe('buildGifSelections', () => {
  it('prefers pack items, then favourites, then relay emoji, then names the file', () => {
    const pack = { items: [{ name: 'p', url: 'https://x/p.gif', kind: 'gif' }] } as unknown as JsMediaPack;
    const out = buildGifSelections(
      { a: pack },
      [{ name: 'p-fav', url: 'https://x/p.gif', kind: 'gif' }, { name: 'f', url: 'https://x/f.gif', kind: 'gif' }],
      { relay: 'https://x/r.gif', still: 'https://x/s.png' },
      { relay: 'gif', still: 'emoji' },
      ['https://media.giphy.com/media/AbC123/giphy.gif', 'https://x/My-Cat.gif', 'https://x/photo.png'],
    );
    expect(out.get('https://x/p.gif')?.pack).toBe(pack);
    expect(out.get('https://x/f.gif')?.item.name).toBe('f');
    expect(out.get('https://x/r.gif')?.item.name).toBe('relay');
    expect(out.has('https://x/s.png')).toBe(false);
    expect(out.get('https://media.giphy.com/media/AbC123/giphy.gif')?.item.name).toBe('abc123');
    expect(out.get('https://x/My-Cat.gif')?.item.name).toBeTruthy();
    expect(out.has('https://x/photo.png')).toBe(false);
  });
});
