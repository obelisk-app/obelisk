/**
 * Media: tags. Values the code in `utils/media/tags/media-packs.ts` reads,
 * kept here so every reader imports the one copy.
 */

import type { JsMediaFavorites } from '@/services/nostr-bridge';

export const EMPTY_MEDIA_FAVORITES: JsMediaFavorites = {
  items: [],
  packAddresses: [],
  createdAt: 0,
};
