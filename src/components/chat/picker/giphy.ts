import { normalizeCustomEmojiName } from '@/utils/media-tags/custom-emoji-tags';
import type { MediaCategory, MediaEntry } from './media-catalog';

/** GIPHY's API key; without one the picker shows only the built-in catalog. */
export const GIPHY_KEY = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

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
