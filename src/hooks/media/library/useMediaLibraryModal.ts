'use client';

import { useTranslations } from 'next-intl';
import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import { useMediaLibrary, type LibraryServer } from '@/hooks/media/library/useMediaLibrary';
import { newPack } from '@/utils/media/library/pack-utils';
import { takePickedFile } from '@/utils/media/upload/picked-file';
import {
  editorKind, favoriteSelection, favoritesOfKind, isFavoriteItem, isServerPack, libraryEmptyKey, packWithItem,
} from '@/utils/media/library/library-view';
import type { LibraryTab, MediaFilter, SelectedMedia } from '@/utils/media/library/types';

/**
 * The media library modal's view model: `useMediaLibrary`'s state and
 * writes, plus what the screen needs on top. Opened with an item
 * (`initialSelection`) it is only that item's menu (`mode: 'item'`) or the
 * pack viewer reached from it (`mode: 'pack'`), and closing either closes
 * the library.
 */
export function useMediaLibraryModal({ onClose, server, initialTab, initialKind, initialSelection }: {
  onClose: () => void;
  server?: LibraryServer;
  initialTab: LibraryTab;
  initialKind: MediaFilter;
  initialSelection?: SelectedMedia;
}) {
  const t = useTranslations();
  const lib = useMediaLibrary({ server, initialTab, initialKind, initialSelection });
  const { favorites, selectedMedia, setSelectedMedia, viewingPack, setViewingPack, setEditing, setTab } = lib;
  const launchedFromItem = !!initialSelection;

  const viewSelectedPack = () => {
    if (selectedMedia?.pack) setViewingPack(selectedMedia.pack);
    setSelectedMedia(null);
  };

  const favoriteSelected = () => {
    if (!selectedMedia) return;
    lib.toggleItem(selectedMedia.item);
    if (launchedFromItem) onClose();
    else setSelectedMedia(null);
  };

  const createPackFromSelected = () => {
    if (!selectedMedia) return;
    const title = t('media.pack.itemTitle', { name: selectedMedia.item.name });
    setEditing(packWithItem(newPack(t('media.pack.newTitle')), title, selectedMedia.item));
    setSelectedMedia(null);
    // Opened from an item, a pack viewer left open would take the screen
    // (mode 'pack') and the editor would never show.
    if (launchedFromItem) setViewingPack(null);
  };

  const editorSaved = async () => {
    setEditing(null);
    setTab('mine');
  };

  return {
    ...lib,
    mode: launchedFromItem && selectedMedia ? 'item' as const : launchedFromItem && viewingPack ? 'pack' as const : 'library' as const,
    isServer: !!server,
    serverPackCount: (server?.emojiSet.packAddresses ?? []).length,
    hasLegacyServerItems: (server?.emojiSet.emojis.length ?? 0) > 0,
    closeOnEscape: !lib.editing && !viewingPack && !selectedMedia,
    favoriteItemsShown: favoritesOfKind(favorites.items, lib.kindFilter),
    emptyKey: libraryEmptyKey(lib.tab),
    editorKind: editorKind(lib.kindFilter),
    isFavoritePack: (pack: JsMediaPack) => favorites.packAddresses.includes(pack.address),
    isFavoriteItem: (item: JsMediaItem) => isFavoriteItem(favorites.items, item),
    isServerPack: (pack: JsMediaPack) => isServerPack(server, pack.address),
    uploadPicked: (input: HTMLInputElement) => void lib.uploadFavorite(takePickedFile(input)),
    createPack: () => setEditing(newPack(t('media.pack.newTitle'))),
    openFavorite: (item: JsMediaItem) => setSelectedMedia(favoriteSelection(item, lib.packsByAddress, lib.packs)),
    openItem: (pack: JsMediaPack, item: JsMediaItem) => setSelectedMedia({ pack, item }),
    removePack: (pack: JsMediaPack) => void lib.deletePack(pack),
    toggleServer: (pack: JsMediaPack) => void lib.toggleServerPack(pack).catch(() => {}),
    closeEditor: () => setEditing(null),
    editorSaved,
    closeViewer: launchedFromItem ? onClose : () => setViewingPack(null),
    closeItemMenu: launchedFromItem ? onClose : () => setSelectedMedia(null),
    viewSelectedPack,
    favoriteSelected,
    createPackFromSelected,
  };
}

export type MediaLibraryModel = ReturnType<typeof useMediaLibraryModal>;
