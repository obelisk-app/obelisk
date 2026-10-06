import { beforeEach, describe, expect, it } from 'vitest';
import { customEntriesFrom, filterByName, resolveRecentEntries, SEARCH_LIMIT } from '@/components/chat/picker/custom-emoji-entries';
import { emojiPickerClasses } from '@/components/chat/picker/emoji-picker-classes';
import { giphyEntries, giphyRequestUrl } from '@/components/chat/picker/giphy';
import { loadRecentMedia, saveRecentMedia } from '@/components/chat/picker/recent-media';
import { emojiTabMaps, personalMediaEntries, serverMediaEntries, visibleMediaSections } from '@/components/chat/picker/media-entries';
import { STARTER_GIFS, type MediaEntry } from '@/components/chat/picker/media-catalog';

describe('custom emoji entries', () => {
  it('normalises names, prefers the declared kind, and sorts', () => {
    const entries = customEntriesFrom(
      { Zed: 'https://x/z.png', anim: 'https://x/a.gif', blank: '' },
      { zed: 'sticker' },
    );
    expect(entries.map((e) => [e.name, e.kind])).toEqual([['anim', 'gif'], ['zed', 'sticker']]);
  });

  it('filters by name and caps the list', () => {
    const many = Array.from({ length: SEARCH_LIMIT + 5 }, (_, i) => ({ name: `e${i}` }));
    expect(filterByName(many, '')).toHaveLength(SEARCH_LIMIT);
    expect(filterByName(many, 'e1').every((e) => e.name.includes('e1'))).toBe(true);
  });

  it('keeps unicode recents, resolves custom ones, and drops what cannot render', () => {
    const custom = customEntriesFrom({ party: 'https://x/party.png' }, {});
    const out = resolveRecentEntries(
      [{ char: '😀' }, { char: ':party:' }, { char: ':stored:', url: 'https://x/s.png', packAddress: '30030:a:b' }, { char: ':gone:' }],
      custom,
    );
    expect(out).toEqual([
      { char: '😀', custom: null },
      { char: ':party:', custom: { name: 'party', url: 'https://x/party.png' } },
      { char: ':stored:', custom: { name: 'stored', url: 'https://x/s.png', packAddress: '30030:a:b' } },
    ]);
  });
});

describe('emojiPickerClasses', () => {
  it('positions the popover by placement and alignment, and sizes the grid by columns', () => {
    const popover = emojiPickerClasses({ placement: 'below', align: 'left' });
    expect(popover.isSheet).toBe(false);
    expect(popover.containerClass).toContain('left-0');
    expect(popover.containerClass).toContain('top-full');
    expect(emojiPickerClasses({ variant: 'floating' }).containerClass.startsWith('flex h-[430px]')).toBe(true);
    expect(emojiPickerClasses({ variant: 'sheet' }).gridClass).toBe('grid grid-cols-7 gap-1.5');
    expect(emojiPickerClasses({ columns: 12 }).gridClass).toBe('grid grid-cols-12 gap-0.5');
  });
});

describe('giphy', () => {
  it('searches by query, by category, or asks for trending', () => {
    expect(giphyRequestUrl('k', 'gif', 'Trending', '').pathname).toBe('/v1/gifs/trending');
    const byCategory = giphyRequestUrl('k', 'sticker', 'Animals', '');
    expect(byCategory.pathname).toBe('/v1/stickers/search');
    expect(byCategory.searchParams.get('q')).toBe('Animals');
    const byQuery = giphyRequestUrl('k', 'gif', 'Animals', ' cats ');
    expect(byQuery.searchParams.get('q')).toBe('cats');
    expect(byQuery.searchParams.get('rating')).toBe('g');
    expect(byQuery.searchParams.get('limit')).toBe('24');
  });

  it('maps results to entries and skips ones without media', () => {
    const out = giphyEntries({
      data: [
        { id: 'abc', title: 'Happy Cat', images: { fixed_height: { url: 'https://g/1.gif' } } },
        { id: 'nomedia' },
      ],
    }, 'sticker', 'Animals');
    expect(out).toEqual([{ name: 'happy_cat', url: 'https://g/1.gif', kind: 'sticker', categories: ['Animals'] }]);
  });
});

describe('recent media', () => {
  beforeEach(() => localStorage.clear());

  it('survives bad storage and keeps the newest 24, one per URL', () => {
    localStorage.setItem('obelisk:recent-media', '{not json');
    expect(loadRecentMedia()).toEqual([]);
    for (let i = 0; i < 30; i += 1) saveRecentMedia({ name: `m${i}`, url: `https://x/${i}.gif`, tab: 'gif' });
    const again = saveRecentMedia({ name: 'm29', url: 'https://x/29.gif', tab: 'gif' });
    expect(again).toHaveLength(24);
    expect(again[0].url).toBe('https://x/29.gif');
    expect(again.filter((e) => e.url === 'https://x/29.gif')).toHaveLength(1);
  });
});

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
