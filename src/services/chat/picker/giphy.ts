import { normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import type { MediaCategory, MediaEntry } from '@/utils/chat/picker/media-catalog';

/**
 * The GIPHY request for a tab, category and query: `search` when there is a
 * term (the query, or the category name), `trending` otherwise.
 */
export function giphyRequestUrl(apiKey: string, tab: 'gif' | 'sticker', category: MediaCategory, query: string): URL {
  const term = query.trim() || (category === 'Trending' ? '' : category);
  const kind = tab === 'gif' ? 'gifs' : 'stickers';
  const endpoint = term ? 'search' : 'trending';
  const url = new URL('https://api.giphy.com/v1/' + kind + '/' + endpoint);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('limit', '24');
  url.searchParams.set('rating', 'g');
  if (term) url.searchParams.set('q', term);
  return url;
}

export interface GiphyPayload {
  data?: Array<{ id: string; title?: string; images?: { fixed_height?: { url?: string } } }>;
}

/** GIPHY results as picker entries, skipping any without a fixed-height rendition. */
export function giphyEntries(payload: GiphyPayload, tab: 'gif' | 'sticker', category: MediaCategory): MediaEntry[] {
  return (payload.data ?? []).flatMap((item) => {
    const mediaUrl = item.images?.fixed_height?.url;
    if (!mediaUrl) return [];
    return [{ name: normalizeCustomEmojiName(item.title || item.id) || item.id, url: mediaUrl, kind: tab === 'sticker' ? 'sticker' as const : 'gif' as const, categories: [category] }];
  });
}

/**
 * One GIPHY request as picker entries. Throws on a network error or a
 * non-2xx answer (and on abort), so the caller decides what an empty grid
 * means.
 */
export async function fetchGiphyEntries(
  apiKey: string,
  tab: 'gif' | 'sticker',
  category: MediaCategory,
  query: string,
  signal?: AbortSignal,
): Promise<MediaEntry[]> {
  const response = await fetch(giphyRequestUrl(apiKey, tab, category, query), { signal });
  if (!response.ok) throw new Error('GIPHY request failed');
  return giphyEntries(await response.json() as GiphyPayload, tab, category);
}
