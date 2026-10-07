import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import type { MessageSticker } from '@/utils/media/tags/sticker-tags';

export interface StickerSelection {
  pack?: JsMediaPack;
  item: JsMediaItem;
}

/**
 * What the media library opens on when a sticker is tapped: the pack the
 * sticker names (or, failing that, any pack that holds its URL) and the
 * matching item, falling back to an item built from the sticker itself.
 */
export function stickerSelection(
  sticker: MessageSticker,
  packsByAddress: Readonly<Record<string, JsMediaPack>>,
): StickerSelection {
  const pack = (sticker.packAddress ? packsByAddress[sticker.packAddress] : undefined)
    ?? Object.values(packsByAddress).find((candidate) => candidate.items.some((item) => item.url === sticker.url));
  const fallbackItem: JsMediaItem = { name: sticker.name, url: sticker.url, kind: 'sticker', ...(sticker.packAddress ? { packAddress: sticker.packAddress } : {}) };
  return {
    ...(pack ? { pack } : {}),
    item: pack?.items.find((item) => item.url === sticker.url) ?? fallbackItem,
  };
}
