import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import { normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import { parseHttpUrl } from '@/utils/url/http-url';
import type { EditablePack, LibraryTab, MediaFilter } from '@/types/media/library';

/** A normalised shortcode not yet in `used`, suffixed `_2`, `_3`... on collision. Adds it to `used`. */
export function uniqueName(raw: string, used: Set<string>): string {
  const base = normalizeCustomEmojiName(raw) || 'media';
  let name = base;
  for (let suffix = 2; used.has(name); suffix += 1) {
    const tail = `_${suffix}`;
    name = `${base.slice(0, 64 - tail.length)}${tail}`;
  }
  used.add(name);
  return name;
}

/** An empty pack with a fresh `d` identifier, titled `title` (the caller's translated "New pack"). */
export function newPack(title: string): EditablePack {
  return {
    identifier: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title,
    description: '',
    image: '',
    items: [],
  };
}

/** All packs, including editable empty packs, newest first. */
export function sortedPacks(packsByAddress: Readonly<Record<string, JsMediaPack>>): JsMediaPack[] {
  return Object.values(packsByAddress)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** The packs a tab shows: whose (tab), what kind (filter) and what text (query). */
export function filterVisiblePacks(
  packs: readonly JsMediaPack[],
  {
    tab,
    kindFilter,
    query,
    myPubkey,
    favoritePackAddresses,
  }: {
    tab: LibraryTab;
    kindFilter: MediaFilter;
    query: string;
    myPubkey: string | null | undefined;
    favoritePackAddresses: readonly string[];
  },
): JsMediaPack[] {
  const value = query.trim().toLowerCase();
  const source = tab === 'mine'
    ? packs.filter((pack) => pack.author === myPubkey)
    : tab === 'favorites'
      ? packs.filter((pack) => favoritePackAddresses.includes(pack.address))
      : packs.filter((pack) => pack.items.length > 0);
  const matchingKind = kindFilter === 'all'
    ? source
    : source.filter((pack) => pack.items.some((item) => item.kind === kindFilter));
  return value
    ? matchingKind.filter((pack) => `${pack.title} ${pack.description} ${pack.items.map((item) => item.name).join(' ')}`.toLowerCase().includes(value))
    : matchingKind;
}

/** Copy assets once, preserving destination metadata and renaming shortcode conflicts. */
export function mergePackItems(
  destination: readonly JsMediaItem[],
  incoming: readonly JsMediaItem[],
): JsMediaItem[] {
  const items: JsMediaItem[] = [];
  const urls = new Set<string>();
  const names = new Set<string>();
  for (const item of [...destination, ...incoming]) {
    const url = parseHttpUrl(item.url)?.href;
    if (!url) throw new Error('Invalid media URL');
    if (urls.has(url)) continue;
    urls.add(url);
    items.push({ ...item, url, name: uniqueName(item.name, names) });
  }
  return items;
}
