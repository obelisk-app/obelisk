'use client';

import { useMemo, useRef, useState } from 'react';
import { uploadToBlossom } from '@/services/media/blossom';
import { normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import { nostrActions, useBridge, useMediaPacks, useMyMediaFavorites } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import type { RelayEmojiSet } from '@/services/relay/relay-emojis';
import { inferMediaKind } from '@/utils/media/tags/media-kind';
import { useTranslations } from 'next-intl';
import { errorText } from '@/utils/errors/error-text';
import { CodedError } from '@/utils/errors/codes';
import { confirmDialog } from '@/services/common/confirm-dialog';
import { filterVisiblePacks, sortedPacks, mergePackItems } from '@/utils/media/library/pack-utils';
import type { EditablePack, LibraryTab, MediaFilter, SelectedMedia } from '@/types/media/library';

export type LibraryServer = { relayUrl: string; emojiSet: RelayEmojiSet };

/**
 * State and actions behind the media library: which tab, filter and query
 * are picked, which pack or item is open, and the favourites / pack /
 * server-pack writes. Every write sets `busy` and reports through `message`.
 */
export function useMediaLibrary({
  server,
  initialTab,
  initialKind,
  initialSelection,
}: {
  server?: LibraryServer;
  initialTab: LibraryTab;
  initialKind: MediaFilter;
  initialSelection?: SelectedMedia;
}) {
  const t = useTranslations();
  const myPubkey = useMyPubkey();
  const bridge = useBridge();
  const writePending = useRef(false);
  const packsByAddress = useMediaPacks();
  const favorites = useMyMediaFavorites();
  const [tab, setTab] = useState<LibraryTab>(initialTab);
  const [kindFilter, setKindFilter] = useState<MediaFilter>(initialKind);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<EditablePack | null>(null);
  const [viewingPack, setViewingPack] = useState<JsMediaPack | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia | null>(initialSelection ?? null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const packs = useMemo(() => sortedPacks(packsByAddress), [packsByAddress]);
  const visiblePacks = useMemo(() => filterVisiblePacks(packs, {
    tab,
    kindFilter,
    query,
    myPubkey,
    favoritePackAddresses: favorites.packAddresses,
  }), [favorites.packAddresses, kindFilter, myPubkey, packs, query, tab]);

  const assertFavoritesCurrent = () => {
    if (bridge && bridge.myPubkey.get() !== myPubkey) throw new CodedError('media-account-changed', 'media-account-changed');
    if (bridge && bridge.myMediaFavorites.get().createdAt !== favorites.createdAt) throw new CodedError('media-stale', 'media-stale');
  };

  const saveFavorites = async (next: { items: readonly JsMediaItem[]; packAddresses: readonly string[] }) => {
    if (writePending.current) return;
    writePending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      assertFavoritesCurrent();
      await nostrActions.saveMediaFavorites(next);
    } catch (error) {
      console.warn('[media] saving favorites failed', error);
      setMessage(errorText(t, error, 'media.error.saveFavorites'));
    } finally {
      writePending.current = false;
      setBusy(false);
    }
  };

  const uploadFavorite = async (file: File | undefined) => {
    if (!file || server || writePending.current) return;
    writePending.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (!myPubkey) {
        setMessage(t('media.error.loginToUpload'));
        return;
      }
      const url = await uploadToBlossom(file);
      const name = normalizeCustomEmojiName(file.name) || "media";
      const kind = kindFilter === "all" ? inferMediaKind(url) : kindFilter;
      assertFavoritesCurrent();
      await nostrActions.saveMediaFavorites({
        items: mergePackItems(favorites.items, [{ name, url, kind }]),
        packAddresses: favorites.packAddresses,
      });
      setTab("favorites");
      setMessage(t('media.notice.uploaded', { name }));
    } catch (error) {
      console.warn('[media] upload failed', error);
      setMessage(errorText(t, error, 'media.error.upload'));
    } finally {
      writePending.current = false;
      setBusy(false);
    }
  };

  const togglePack = (pack: JsMediaPack) => {
    const selected = favorites.packAddresses.includes(pack.address);
    void saveFavorites({
      items: favorites.items,
      packAddresses: selected
        ? favorites.packAddresses.filter((address) => address !== pack.address)
        : [...favorites.packAddresses, pack.address],
    });
  };

  const toggleItem = (item: JsMediaItem) => {
    const selected = favorites.items.some((favorite) => favorite.url === item.url);
    void saveFavorites({
      packAddresses: favorites.packAddresses,
      items: selected
        ? favorites.items.filter((favorite) => favorite.url !== item.url)
        : mergePackItems(favorites.items, [item]),
    });
  };

  const deletePack = async (pack: JsMediaPack) => {
    const ok = await confirmDialog({
      title: t('media.confirmDeletePack', { title: pack.title }),
      message: t('media.confirmDeletePackBody'),
      confirmLabel: t('common.confirm.delete'),
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      await nostrActions.deleteMediaPack(pack.address);
      setMessage(t('media.notice.deleted', { title: pack.title }));
    } catch (error) {
      console.warn('[media] deleting the pack failed', error);
      setMessage(t('media.error.deletePack'));
    } finally {
      writePending.current = false;
      setBusy(false);
    }
  };


  return {
    myPubkey,
    packsByAddress,
    favorites,
    packs,
    visiblePacks,
    tab, setTab,
    kindFilter, setKindFilter,
    query, setQuery,
    editing, setEditing,
    viewingPack, setViewingPack,
    selectedMedia, setSelectedMedia,
    busy,
    message,
    uploadFavorite,
    togglePack,
    saveOwnedPack: (draft: EditablePack) => void saveFavorites({ items: favorites.items,
      packAddresses: [...new Set([...favorites.packAddresses, `30030:${myPubkey}:${draft.identifier}`])] }),
    toggleItem,
    deletePack,
  };
}
