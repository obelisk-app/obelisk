import type { JsMediaItem, JsMediaKind, JsMediaPack } from '@/services/nostr-bridge';
import type { EditablePack, LibraryTab, MediaFilter, SelectedMedia } from '@/types/media/library';

/** Whether an item is among the saved favourites (matched by URL). */
export function isFavoriteItem(favorites: readonly JsMediaItem[], item: Pick<JsMediaItem, 'url'>): boolean {
  return favorites.some((favorite) => favorite.url === item.url);
}

/** The favourites the kind filter lets through. */
export function favoritesOfKind(items: readonly JsMediaItem[], kind: MediaFilter): JsMediaItem[] {
  return items.filter((item) => kind === 'all' || item.kind === kind);
}

/**
 * A favourite opened from its thumbnail, with the pack it came from: the one
 * it names, else the first pack holding its URL, else none.
 */
export function favoriteSelection(
  item: JsMediaItem,
  packsByAddress: Readonly<Record<string, JsMediaPack>>,
  packs: readonly JsMediaPack[],
): SelectedMedia {
  const source = item.packAddress
    ? packsByAddress[item.packAddress]
    : packs.find((pack) => pack.items.some((value) => value.url === item.url));
  return { ...(source ? { pack: source } : {}), item };
}

/** Whether the relay being edited already offers a pack. */
export function isServerPack(server: { emojiSet: { packAddresses?: readonly string[] } } | undefined, address: string): boolean {
  return server?.emojiSet.packAddresses?.includes(address) ?? false;
}

/** The empty-grid copy for a tab. */
export function libraryEmptyKey(tab: LibraryTab) {
  return tab === 'mine' ? 'media.empty.mine' as const : tab === 'favorites' ? 'media.empty.favorites' as const : 'media.empty.none' as const;
}

/** The kind a new pack's items start as: the filter's, or sticker under "all". */
export function editorKind(kind: MediaFilter): JsMediaKind {
  return kind === 'all' ? 'sticker' : kind;
}

/** A new pack holding one item, titled after it. */
export function packWithItem(draft: EditablePack, title: string, item: JsMediaItem): EditablePack {
  return { ...draft, title, items: [item] };
}
