import { normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import { inferMediaKind } from '@/utils/media/tags/media-kind';
import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';

export interface GifSelection {
  pack?: JsMediaPack;
  item: JsMediaItem;
}

/**
 * For every GIF a message might show, what the media library should open
 * on when it is tapped: a pack item first, then a favourite, then a relay
 * emoji of kind gif, then (for this message's own GIF URLs) an item named
 * after the file, or after the GIPHY id for `.../<id>/giphy.gif`.
 */
export function buildGifSelections(
  packs: Readonly<Record<string, JsMediaPack>>,
  favoriteItems: ReadonlyArray<JsMediaItem>,
  serverEmojis: Readonly<Record<string, string>>,
  serverMediaKinds: Readonly<Record<string, string>>,
  urls: ReadonlyArray<string>,
): Map<string, GifSelection> {
  const selections = new Map<string, GifSelection>();
  for (const pack of Object.values(packs)) {
    for (const item of pack.items) if (item.kind === 'gif') selections.set(item.url, { pack, item });
  }
  for (const item of favoriteItems) {
    if (item.kind === 'gif' && !selections.has(item.url)) selections.set(item.url, { item });
  }
  for (const [name, url] of Object.entries(serverEmojis)) {
    if (serverMediaKinds[name] === 'gif' && !selections.has(url)) selections.set(url, { item: { name, url, kind: 'gif' } });
  }
  for (const url of urls) {
    if (inferMediaKind(url) !== 'gif' || selections.has(url)) continue;
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    const filename = parts.at(-1) ?? '';
    const rawName = /^giphy\.gif$/i.test(filename) ? parts.at(-2) : filename;
    selections.set(url, { item: { name: normalizeCustomEmojiName(rawName ?? '') || 'gif', url, kind: 'gif' } });
  }
  return selections;
}
