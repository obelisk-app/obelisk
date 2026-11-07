/**
 * What the GIF / sticker grid shows, derived from the sources it merges:
 * the reader's personal stickers and favourites, the relay's custom set,
 * GIPHY results, the built-in starters and recents. All pure.
 */
import { normalizeCustomEmojiName, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { mergePackItems } from '@/utils/media/library/pack-utils';
import { mediaItemsFromPacks } from '@/utils/media/tags/media-packs';
import { parseHttpUrl } from '@/utils/url/http-url';
import { inferMediaKind } from '@/utils/media/tags/media-kind';
import type { JsMediaFavorites, JsMediaKind, JsMediaPack } from '@/services/nostr-bridge';
import {
  STARTER_GIFS,
  STARTER_STICKERS,
  type MediaCategory,
  type MediaEntry,
  type MediaPickerTab,
  type RecentMediaEntry,
} from './media-catalog';

type KindOverrides = Readonly<Record<string, JsMediaKind>>;

/** Personal stickers plus favourites (packs and single items), one per URL, by name. */
export function personalMediaEntries(
  personal: CustomEmojiMap,
  favorites: JsMediaFavorites,
  packs: Readonly<Record<string, JsMediaPack>>,
  kindOverrides: KindOverrides,
): MediaEntry[] {
  const local = Object.entries(personal).flatMap(([name, url]) => {
    const normalized = normalizeCustomEmojiName(name);
    const validUrl = parseHttpUrl(url)?.href;
    return normalized && validUrl ? [{ name: normalized, url: validUrl, kind: 'sticker' as const }] : [];
  });
  return mergePackItems(favorites.items, [...mediaItemsFromPacks(favorites.packAddresses, packs), ...local])
    .map((item) => ({ ...item, kind: kindOverrides[item.url] ?? item.kind }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The relay's custom set, minus anything already personal or built in. */
export function serverMediaEntries(
  customEmojis: CustomEmojiMap,
  personalEntries: ReadonlyArray<MediaEntry>,
  kindOverrides: KindOverrides,
  serverMediaKinds: Readonly<Record<string, JsMediaKind>>,
): MediaEntry[] {
  const personalUrls = new Set(personalEntries.map((entry) => entry.url));
  const starterUrls = new Set([...STARTER_GIFS, ...STARTER_STICKERS].map((entry) => entry.url));
  return Object.entries(customEmojis)
    .map(([name, url]) => {
      const normalized = normalizeCustomEmojiName(name);
      return { name: normalized, url, kind: kindOverrides[url] ?? serverMediaKinds[normalized] ?? (inferMediaKind(url) === 'gif' ? 'gif' as const : 'sticker' as const) };
    })
    .filter((entry) => entry.name && entry.url && !personalUrls.has(entry.url) && !starterUrls.has(entry.url))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** The emoji-kind entries, as the map and kinds the nested EmojiPicker takes. */
export function emojiTabMaps(serverEntries: ReadonlyArray<MediaEntry>, personalEntries: ReadonlyArray<MediaEntry>) {
  const personal = personalEntries.filter((entry) => entry.kind === 'emoji').map((entry) => ({ ...entry, kind: 'emoji' as const }));
  const server = serverEntries.filter((entry) => entry.kind === 'emoji').map((entry) => ({ ...entry, kind: 'emoji' as const }));
  const emojiEntries = mergePackItems(personal, server);
  return {
    customEmojis: Object.fromEntries(emojiEntries.map((entry) => [entry.name, entry.url])) as CustomEmojiMap,
    customMediaKinds: Object.fromEntries(emojiEntries.map((entry) => [entry.name, 'emoji' as const])) as Record<string, JsMediaKind>,
  };
}

/** Each section's entries for the current tab, query and category. */
export function visibleMediaSections({
  tab,
  query,
  category,
  recentMedia,
  serverEntries,
  personalEntries,
  remote,
  kindOverrides,
  brokenUrls,
}: {
  tab: MediaPickerTab;
  query: string;
  category: MediaCategory;
  recentMedia: ReadonlyArray<RecentMediaEntry>;
  serverEntries: ReadonlyArray<MediaEntry>;
  personalEntries: ReadonlyArray<MediaEntry>;
  remote: ReadonlyArray<MediaEntry>;
  kindOverrides: KindOverrides;
  brokenUrls: ReadonlySet<string>;
}) {
  const normalizedQuery = normalizeCustomEmojiName(query);
  const matchesQuery = (entry: MediaEntry) => !normalizedQuery || entry.name.includes(normalizedQuery);
  const matchesTab = (entry: MediaEntry) => entry.kind === tab;
  const recentVisible = recentMedia
    .map((entry) => ({ ...entry, kind: kindOverrides[entry.url] ?? entry.kind ?? entry.tab }))
    .filter((entry) => matchesTab(entry) && matchesQuery(entry));
  const serverVisible = serverEntries.filter((entry) => matchesTab(entry) && matchesQuery(entry));
  const personalVisible = personalEntries.filter((entry) => matchesTab(entry) && matchesQuery(entry));
  const starterEntries: MediaEntry[] = [
    ...STARTER_GIFS.map((entry) => ({ ...entry, kind: kindOverrides[entry.url] ?? 'gif' as const })),
    ...STARTER_STICKERS.map((entry) => ({ ...entry, kind: 'sticker' as const })),
  ];
  const defaultCatalog = [
    ...remote.map((entry) => ({ ...entry, kind: kindOverrides[entry.url] ?? entry.kind ?? tab })),
    ...starterEntries,
  ].filter((entry) => matchesTab(entry) && matchesQuery(entry));
  // The built-in/GIPHY catalog is curated, not user content: an entry whose
  // media 404s is pure noise, so drop it instead of leaving a broken tile.
  // Server and personal media keep their tile (with the fallback glyph) so the
  // owner can see that something needs fixing.
  const defaultVisible = (category === 'Trending' || category === 'Recent' || normalizedQuery
    ? defaultCatalog
    : defaultCatalog.filter((entry) => entry.categories?.includes(category))
  ).filter((entry) => !brokenUrls.has(entry.url));
  return { recentVisible, serverVisible, personalVisible, defaultVisible };
}
