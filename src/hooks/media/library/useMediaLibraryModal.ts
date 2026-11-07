'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBridge, type JsMediaItem, type JsMediaPack } from '@/services/nostr-bridge';
import { useMediaLibrary, type LibraryServer } from '@/hooks/media/library/useMediaLibrary';
import { mergePackItems, newPack } from '@/utils/media/library/pack-utils';
import { takePickedFile } from '@/utils/media/upload/picked-file';
import {
  editorKind, favoriteSelection, favoritesOfKind, isFavoriteItem, isServerPack, libraryEmptyKey, packWithItem,
} from '@/utils/media/library/library-view';
import { useToastStore } from '@/store/feedback/toast';
import { translate } from '@/i18n/runtime';
import { saveLibraryPack } from '@/services/media/save-library-pack';
import { mediaMergePreview } from '@/utils/media/library/merge-preview';
import { inferMediaKind } from '@/utils/media/tags/media-kind';
import { useRelayOperatorPubkey } from '@/hooks/relay/operator/useRelayOperatorPubkey';
import type { EditablePack, MediaTransfer, LibraryTab, MediaFilter, SelectedMedia } from '@/types/media/library';

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
  const [savedOffer, setSavedOffer] = useState<EditablePack | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [transfer, setTransfer] = useState<MediaTransfer | null>(null);
  const bridge = useBridge();
  const [excluded, setExcluded] = useState<readonly string[]>([]);
  const [retry, setRetry] = useState(0);
  const referenceKey = (server?.emojiSet.packAddresses ?? []).filter((address) => !excluded.includes(address)).join('|');
  useEffect(() => {
    if (!bridge || !referenceKey) return;
    return bridge.loadMediaPacks(referenceKey.split('|'));
  }, [bridge, referenceKey, retry]);
  const operator = useRelayOperatorPubkey(server?.relayUrl ?? null);
  const canEditServer = !!server && operator === lib.myPubkey;
  const missingPacks = (server?.emojiSet.packAddresses ?? []).filter((address) => !excluded.includes(address) && !lib.packsByAddress[address]);
  const serverDraft: EditablePack | undefined = server && !missingPacks.length ? {
    identifier: `obelisk:emojis:${server.relayUrl}`,
    title: server.emojiSet.title || t('media.manage.serverList'), description: '', image: '',
    serverRelay: server.relayUrl, owner: lib.myPubkey ?? undefined,
    baseCreatedAt: server.emojiSet.updatedAt,
    items: mergePackItems(
      server.emojiSet.emojis.map((item) => ({ ...item, kind: item.kind ?? inferMediaKind(item.url) })),
      (server.emojiSet.packAddresses ?? []).filter((address) => !excluded.includes(address)).flatMap((address) => lib.packsByAddress[address]?.items ?? []),
    ),
  } : undefined;
  const previewTransfer = (draft: EditablePack) => {
    setEditorVersion((value) => value + 1);
    setEditing(draft);
    setTransfer(null);
    setSelectedMedia(null);
    setViewingPack(null);
  };
  const merge = () => setTransfer({ items: [], addresses: [] });
  const addSelected = () => {
    if (selectedMedia) setTransfer({ items: [selectedMedia.item], addresses: [] });
  };
  const editPack = (pack: JsMediaPack) => setEditing({ ...pack, owner: pack.author, baseCreatedAt: pack.createdAt });
  const editServer = () => { if (canEditServer && serverDraft) setEditing(serverDraft); };
  const copyServer = (pack: JsMediaPack) => {
    if (canEditServer && serverDraft) {
      const report = mediaMergePreview(serverDraft.items, pack.items);
      previewTransfer({ ...serverDraft, items: report.items, mergeReview: report });
    }
  };
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
    setEditing({ ...packWithItem(newPack(t('media.pack.newTitle')), title, selectedMedia.item), owner: lib.myPubkey ?? undefined });
    setSelectedMedia(null);
    // Opened from an item, a pack viewer left open would take the screen
    // (mode 'pack') and the editor would never show.
    if (launchedFromItem) setViewingPack(null);
  };

  const editorSaved = async (draft?: EditablePack) => {
    if (draft && !draft.serverRelay && !draft.baseCreatedAt) setSavedOffer(draft);
    useToastStore.getState().pushToast({ title: translate('media.manage.saved'), body: '' });
    setEditing(null);
    setTab(server ? 'server' : 'mine');
  };

  return {
    ...lib,
    savedOffer, editorVersion,
    saveOffer: () => { if (savedOffer) lib.saveOwnedPack(savedOffer); setSavedOffer(null); },
    refreshDraft: (draft: EditablePack) => {
      const latest = draft.serverRelay ? serverDraft : lib.packs.find((pack) => pack.identifier === draft.identifier && pack.author === draft.owner);
      if (!latest) return;
      const base = 'createdAt' in latest ? { ...latest, owner: latest.author, baseCreatedAt: latest.createdAt } : latest;
      const report = mediaMergePreview(base.items, draft.items);
      previewTransfer({ ...base, items: report.items, mergeReview: report });
    },
    transfer, closeTransfer: () => { if (transfer?.destination) setEditing(transfer.destination); setTransfer(null); },
    copyItems: (items: readonly JsMediaItem[]) => setTransfer({ items, addresses: [] }), previewTransfer, merge, addSelected, editPack, editServer,
    serverDraft, missingPacks, canEditServer,
    retryReferences: () => setRetry((value) => value + 1),
    excludeReference: (address: string) => setExcluded((previous) => [...previous, address]),
    importDraft: (draft: EditablePack) => { setEditing(null); setTransfer({ destination: draft, items: [], addresses: [] }); },
    publishDraft: (draft: EditablePack) => saveLibraryPack(draft, server?.emojiSet),
    mode: !transfer && !lib.editing && launchedFromItem && selectedMedia ? 'item' as const : !transfer && !lib.editing && launchedFromItem && viewingPack ? 'pack' as const : 'library' as const,
    isServer: !!server,
    serverPackCount: (server?.emojiSet.packAddresses ?? []).length,
    hasLegacyServerItems: (server?.emojiSet.emojis.length ?? 0) > 0,
    closeOnEscape: !transfer && !lib.editing && !viewingPack && !selectedMedia,
    favoriteItemsShown: favoritesOfKind(favorites.items, lib.kindFilter),
    emptyKey: libraryEmptyKey(lib.tab),
    editorKind: editorKind(lib.kindFilter),
    isFavoritePack: (pack: JsMediaPack) => favorites.packAddresses.includes(pack.address),
    isFavoriteItem: (item: JsMediaItem) => isFavoriteItem(favorites.items, item),
    isServerPack: (pack: JsMediaPack) => isServerPack(server, pack.address),
    uploadPicked: (input: HTMLInputElement) => void lib.uploadFavorite(takePickedFile(input)),
    createPack: () => setEditing({ ...newPack(t('media.pack.newTitle')), owner: lib.myPubkey ?? undefined }),
    openFavorite: (item: JsMediaItem) => setSelectedMedia(favoriteSelection(item, lib.packsByAddress, lib.packs)),
    openItem: (pack: JsMediaPack, item: JsMediaItem) => setSelectedMedia({ pack, item }),
    removePack: (pack: JsMediaPack) => void lib.deletePack(pack),
    toggleServer: copyServer,
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
