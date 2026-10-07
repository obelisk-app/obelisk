import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGiphyEntries, giphyEntries, giphyRequestUrl } from '@/services/chat/picker/giphy';

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

describe('fetchGiphyEntries', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('fetches the request URL and maps the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'abc', title: 'Wave', images: { fixed_height: { url: 'https://g/w.gif' } } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchGiphyEntries('k', 'gif', 'Trending', '')).resolves.toEqual([
      { name: 'wave', url: 'https://g/w.gif', kind: 'gif', categories: ['Trending'] },
    ]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/gifs/trending');
  });

  it('throws on a failed answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchGiphyEntries('k', 'gif', 'Trending', '')).rejects.toThrow();
  });
});
