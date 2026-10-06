import { normalizeCustomEmojiName, type CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import { inferMediaKind } from '@/utils/media-tags/media-kind';
import type { JsMediaKind } from '@/services/nostr-bridge';
import type { RecentEmoji } from '@/services/recent-emojis';
import type { CustomEmojiEntry, PickedCustomEmoji } from './picker-types';

/** Most results a search shows per section. */
export const SEARCH_LIMIT = 80;

/**
 * The custom set as sorted entries with a kind each: the declared kind when
 * the relay says one, else whatever the URL looks like.
 */
export function customEntriesFrom(
  customEmojis: CustomEmojiMap,
  customMediaKinds: Readonly<Record<string, JsMediaKind>>,
): CustomEmojiEntry[] {
  return Object.entries(customEmojis)
    .map(([name, url]) => {
      const normalized = normalizeCustomEmojiName(name);
      return { name: normalized, url, kind: customMediaKinds[normalized] ?? inferMediaKind(url) };
    })
    .filter((entry) => entry.name && entry.url)
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Entries whose name contains `q` (all of them for an empty query), capped. */
export function filterByName<T extends { name: string }>(entries: ReadonlyArray<T>, q: string): T[] {
  const list = q ? entries.filter((entry) => entry.name.includes(q)) : entries;
  return list.slice(0, SEARCH_LIMIT);
}

export interface RecentPickerEntry {
  char: string;
  custom: PickedCustomEmoji | null;
}

/**
 * A recent shortcode is only renderable if we can resolve it back to media,
 * either from the URL stored with the pick or from the current custom set.
 * Anything left unresolved is dropped: printing `:name:` as text in a media
 * grid reads as a broken tile, not as an emoji.
 */
export function resolveRecentEntries(
  recents: ReadonlyArray<RecentEmoji>,
  customEntries: ReadonlyArray<CustomEmojiEntry>,
): RecentPickerEntry[] {
  return recents.flatMap<RecentPickerEntry>((recent) => {
    const match = /^:([a-z0-9_]{1,64}):$/i.exec(recent.char);
    if (!match) return [{ char: recent.char, custom: null }];
    const name = normalizeCustomEmojiName(match[1]);
    const known = customEntries.find((entry) => entry.name === name);
    const url = recent.url ?? known?.url;
    if (!url) return [];
    const packAddress = recent.packAddress ?? known?.packAddress;
    return [{ char: recent.char, custom: { name, url, ...(packAddress ? { packAddress } : {}) } }];
  });
}
