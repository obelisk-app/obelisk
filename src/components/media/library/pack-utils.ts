import type { JsMediaPack } from '@/services/nostr-bridge';
import { normalizeCustomEmojiName } from '@/utils/media-tags/custom-emoji-tags';
import type { EditablePack, LibraryTab, MediaFilter } from './types';

/** A normalised shortcode not yet in `used`, suffixed `_2`, `_3`... on collision. Adds it to `used`. */
export function uniqueName(raw: string, used: Set<string>): string {
  const base = normalizeCustomEmojiName(raw) || 'media';
  let name = base;
  for (let suffix = 2; used.has(name); suffix += 1) name = `${base}_${suffix}`;
  used.add(name);
  return name;
}

/** An empty pack with a fresh `d` identifier. */
export function newPack(): EditablePack {
  return {
    identifier: typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'New pack',
    description: '',
    image: '',
    items: [],
  };
}

export function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Packs with at least one item, newest first. */
export function sortedPacks(packsByAddress: Readonly<Record<string, JsMediaPack>>): JsMediaPack[] {
  return Object.values(packsByAddress)
    .filter((pack) => pack.items.length > 0)
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
      : [...packs];
  const matchingKind = kindFilter === 'all'
    ? source
    : source.filter((pack) => pack.items.some((item) => item.kind === kindFilter));
  return value
    ? matchingKind.filter((pack) => `${pack.title} ${pack.description} ${pack.items.map((item) => item.name).join(' ')}`.toLowerCase().includes(value))
    : matchingKind;
}
