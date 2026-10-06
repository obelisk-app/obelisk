/**
 * Single-pass tag readers for the ingest hot path, and the DM tag parser
 * that shares them. Pure: an event or a tag array in, values out.
 */
import type { Event as NostrEvent } from 'nostr-tools';
import { customEmojiMapFromTags } from '@/utils/media-tags/custom-emoji-tags';
import { stickerFromTags } from '@/utils/media-tags/sticker-tags';
import type { JsDirectMessage } from './types';

/**
 * First value of the first tag whose name matches, or `undefined`. Equivalent
 * to `ev.tags.find((t) => t[0] === name)?.[1]` but single-pass and avoids the
 * intermediate closure allocation per ingest.
 *
 * For tags that carry a marker as a fourth element (e.g. NIP-10
 * `["e", id, relay, "reply"]`), use the explicit `.find()` form: the marker
 * predicate doesn't fit a generic helper.
 */
export function getTag(ev: NostrEvent, name: string): string | undefined {
  for (const t of ev.tags) {
    if (t[0] === name) return t[1];
  }
  return undefined;
}

/**
 * Values of every tag matching `name`, in document order, skipping entries
 * whose value is empty. Equivalent to
 * `ev.tags.filter((t) => t[0] === name).map((t) => t[1])` but single-pass.
 */
export function getAllTags(ev: NostrEvent, name: string): string[] {
  const out: string[] = [];
  for (const t of ev.tags) {
    if (t[0] === name && typeof t[1] === 'string' && t[1].length > 0) out.push(t[1]);
  }
  return out;
}

/** Custom-emoji and sticker fields for a DM, parsed the same way group messages are. */
export function dmTagExtras(
  content: string,
  tags: ReadonlyArray<ReadonlyArray<string>>,
): Pick<JsDirectMessage, 'customEmojis' | 'sticker'> {
  if (tags.length === 0) return {};
  const customEmojis = customEmojiMapFromTags(tags);
  const sticker = stickerFromTags(content, tags);
  return {
    ...(Object.keys(customEmojis).length > 0 ? { customEmojis } : {}),
    ...(sticker ? { sticker } : {}),
  };
}
