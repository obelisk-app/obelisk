'use client';

import { useMemo } from 'react';
import { useMediaPacks, useMyMediaFavorites } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { buildGifSelections } from '@/components/chat/gallery/gif-selections';

/** `buildGifSelections` over the live packs, favourites and relay emoji. */
export function useGifSelections(urls: ReadonlyArray<string>) {
  const packs = useMediaPacks();
  const favorites = useMyMediaFavorites();
  const serverEmojis = useChatStore((state) => state.serverEmojis);
  const serverMediaKinds = useChatStore((state) => state.serverMediaKinds);
  return useMemo(
    () => buildGifSelections(packs, favorites.items, serverEmojis, serverMediaKinds, urls),
    [favorites.items, packs, serverEmojis, serverMediaKinds, urls],
  );
}
