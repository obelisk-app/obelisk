'use client';

import { useMemo, useState } from 'react';
import { uploadToBlossom } from '@/services/blossom';
import { normalizeCustomEmojiName } from '@/utils/media-tags/custom-emoji-tags';
import { nostrActions, useMediaPacks, useMyMediaFavorites, useMyPubkey } from '@/services/nostr-bridge';
import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import { publishRelayEmojiSet, type RelayEmojiSet } from '@/services/relay-emojis';
import { inferMediaKind } from '@/utils/media-tags/media-kind';
import { useTranslations } from 'next-intl';
import { confirmDialog } from '@/services/confirm-dialog';
import { filterVisiblePacks, sortedPacks } from '@/utils/media-library/pack-utils';
import type { EditablePack, LibraryTab, MediaFilter, SelectedMedia } from '@/utils/media-library/types';

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

  const saveFavorites = async (next: { items: readonly JsMediaItem[]; packAddresses: readonly string[] }) => {
    setBusy(true);
    setMessage(null);
    try {
      await nostrActions.saveMediaFavorites(next);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save favorites.');
    } finally {
      setBusy(false);
    }
  };

  const uploadFavorite = async (file: File | undefined) => {
    if (!file || server) return;
    setBusy(true);
    setMessage(null);
    try {
      if (!myPubkey) throw new Error("Log in to upload media.");
      const url = await uploadToBlossom(file);
      const name = normalizeCustomEmojiName(file.name) || "media";
      const kind = kindFilter === "all" ? inferMediaKind(url) : kindFilter;
      await nostrActions.saveMediaFavorites({
        items: [
          ...favorites.items.filter((item) => item.url !== url && item.name !== name),
          { name, url, kind },
        ],
        packAddresses: favorites.packAddresses,
      });
      setTab("favorites");
      setMessage("Uploaded :" + name + ": to individual favorites.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not upload media.");
    } finally {
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
        : [...favorites.items, item],
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
      setMessage('Deleted “' + pack.title + '”.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not delete pack.');
    } finally {
      setBusy(false);
    }
  };

  const toggleServerPack = async (pack: JsMediaPack) => {
    if (!server) return;
    const selected = server.emojiSet.packAddresses?.includes(pack.address) ?? false;
    const packAddresses = selected
      ? (server.emojiSet.packAddresses ?? []).filter((address) => address !== pack.address)
      : [...(server.emojiSet.packAddresses ?? []), pack.address];
    setBusy(true);
    setMessage(null);
    try {
      await publishRelayEmojiSet(server.relayUrl, {
        ...server.emojiSet,
        title: server.emojiSet.title || "Server packs",
        emojis: [],
        packAddresses,
      });
      setMessage((selected ? "Removed “" : "Added “") + pack.title + (selected ? "” from" : "” to") + " this server.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update server packs.");
      throw error;
    } finally {
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
    toggleItem,
    deletePack,
    toggleServerPack,
  };
}
