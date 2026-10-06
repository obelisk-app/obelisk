'use client';

import { useMemo } from 'react';
import { useMediaPacks } from '@/services/nostr-bridge';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import { stickerSelection, type StickerSelection } from '@/utils/media-library/sticker-selection';

/**
 * The media-library selection for a sticker, recomputed only when its
 * fields or the known packs change (a parent re-render hands in a fresh
 * sticker object with the same values).
 */
export function useStickerSelection(sticker: MessageSticker): StickerSelection {
  const packsByAddress = useMediaPacks();
  const { name, url, packAddress } = sticker;
  return useMemo(
    () => stickerSelection({ name, url, ...(packAddress ? { packAddress } : {}) }, packsByAddress),
    [packsByAddress, name, packAddress, url],
  );
}
