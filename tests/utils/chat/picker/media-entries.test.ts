import { describe, expect, it } from 'vitest';
import { emojiTabMaps, personalMediaEntries, serverMediaEntries, visibleMediaSections } from '@/utils/chat/picker/media-entries';
import { STARTER_GIFS, type MediaEntry } from '@/utils/chat/picker/media-catalog';

describe('media entries', () => {
  const favorites = { items: [{ name: 'fav', url: 'https://x/fav.gif', kind: 'gif' as const }], packAddresses: [], createdAt: 0 };

  it('merges personal stickers and favourites, applying kind overrides', () => {
    const out = personalMediaEntries({ Mine: 'https://x/mine.png' }, favorites, {}, { 'https://x/fav.gif': 'sticker' });
    expect(out.map((e) => [e.name, e.kind])).toEqual([['fav', 'sticker'], ['mine', 'sticker']]);
  });

  it('leaves out server media that is already personal or built in', () => {
    const personal: MediaEntry[] = [{ name: 'p', url: 'https://x/p.png', kind: 'sticker' }];
    const out = serverMediaEntries(
      { p: 'https://x/p.png', starter: STARTER_GIFS[0].url, own: 'https://x/own.gif', emo: 'https://x/emo.png' },
      personal,
      {},
      { emo: 'emoji' },
    );
    expect(out.map((e) => [e.name, e.kind])).toEqual([['emo', 'emoji'], ['own', 'gif']]);
    expect(emojiTabMaps(out, personal)).toEqual({ customEmojis: { emo: 'https://x/emo.png' }, customMediaKinds: { emo: 'emoji' } });
  });

  it('filters the default catalog by category and hides broken built-in tiles', () => {
    const base = {
      tab: 'gif' as const, query: '', recentMedia: [], serverEntries: [], personalEntries: [], remote: [], kindOverrides: {},
    };
    const trending = visibleMediaSections({ ...base, category: 'Trending', brokenUrls: new Set<string>() });
    expect(trending.defaultVisible).toHaveLength(STARTER_GIFS.length);
    const animals = visibleMediaSections({ ...base, category: 'Animals', brokenUrls: new Set<string>() });
    expect(animals.defaultVisible.every((e) => e.categories?.includes('Animals'))).toBe(true);
    const broken = visibleMediaSections({ ...base, category: 'Trending', brokenUrls: new Set([STARTER_GIFS[0].url]) });
    expect(broken.defaultVisible).toHaveLength(STARTER_GIFS.length - 1);
    const searched = visibleMediaSections({ ...base, category: 'Animals', query: 'party', brokenUrls: new Set<string>() });
    expect(searched.defaultVisible.map((e) => e.name)).toEqual(['party']);
  });
});
