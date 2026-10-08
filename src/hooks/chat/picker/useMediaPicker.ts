'use client';

import { useMemo, useState } from 'react';
import { uploadToBlossom } from '@/services/media/blossom';
import { loadPersonalStickers } from '@/services/chat/picker/personal-stickers';
import { normalizeCustomEmojiName, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { nostrActions, useMediaPacks, useMyMediaFavorites, type JsMediaItem, type JsMediaKind } from '@/services/nostr-bridge';
import { useMyPubkey } from '@/hooks/session/useSession';
import { useChatStore } from '@/store/chat';
import { inferMediaKind } from '@/utils/media/tags/media-kind';
import { detectGifPresentation } from '@/services/media/gif-presentation';
import type { PickedCustomEmoji } from '@/types/chat/picker';
import type { MediaCategory, MediaEntry, MediaPickerTab, RecentMediaEntry } from '@/utils/chat/picker/media-catalog';
import { loadRecentMedia, saveRecentMedia } from '@/services/chat/picker/recent-media';
import { useGiphyResults } from './useGiphyResults';
import { emojiTabMaps, personalMediaEntries, serverMediaEntries, visibleMediaSections } from '@/utils/chat/picker/media-entries';
import { useTranslations } from 'next-intl';
import { errorReason } from '@/utils/errors/error-text';
import { useToastStore } from '@/store/feedback/toast';
import { CodedError } from '@/utils/errors/codes';

/**
 * State and actions of the media picker: tab, category and query; the
 * merged entry lists; uploads of new media into the reader's favourites;
 * favouriting; picking (which records a recent); and the two corrections
 * learned from loading a tile (an animated GIF that is really a sticker,
 * and a built-in tile whose media is gone).
 */
export function useMediaPicker({
  initialTab,
  customEmojis,
  onPick,
}: {
  initialTab: MediaPickerTab;
  customEmojis: CustomEmojiMap;
  onPick: (emoji: string, custom?: PickedCustomEmoji, kind?: MediaPickerTab) => void;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<MediaPickerTab>(initialTab);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MediaCategory>('Trending');
  const [recentMedia, setRecentMedia] = useState<RecentMediaEntry[]>(loadRecentMedia);
  const [personal] = useState<CustomEmojiMap>(() => loadPersonalStickers());
  const [uploading, setUploading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState<'mine' | 'favorites' | null>(null);
  const [kindOverrides, setKindOverrides] = useState<Record<string, JsMediaKind>>({});
  const [brokenUrls, setBrokenUrls] = useState<ReadonlySet<string>>(() => new Set());
  const mediaPacks = useMediaPacks();
  const mediaFavorites = useMyMediaFavorites();
  const myPubkey = useMyPubkey();
  const serverMediaKinds = useChatStore((state) => state.serverMediaKinds);
  const remote = useGiphyResults(tab, category, query);

  const personalEntries = useMemo(
    () => personalMediaEntries(personal, mediaFavorites, mediaPacks, kindOverrides),
    [kindOverrides, mediaFavorites, mediaPacks, personal],
  );
  const serverEntries = useMemo(
    () => serverMediaEntries(customEmojis, personalEntries, kindOverrides, serverMediaKinds),
    [customEmojis, kindOverrides, personalEntries, serverMediaKinds],
  );
  const emojiMaps = emojiTabMaps(serverEntries, personalEntries);
  const sections = visibleMediaSections({
    tab, query, category, recentMedia, serverEntries, personalEntries, remote, kindOverrides, brokenUrls,
  });
  const favoriteUrls = new Set(mediaFavorites.items.map((item) => item.url));

  const createMedia = async (file: File | undefined, kind: JsMediaKind) => {
    if (!file) return;
    setUploading(true);
    try {
      if (!myPubkey) throw new CodedError('not-logged-in', 'Log in to create media.');
      const url = await uploadToBlossom(file);
      const name = normalizeCustomEmojiName(file.name) || kind;
      await nostrActions.saveMediaFavorites({
        items: [
          ...mediaFavorites.items.filter((item) => item.url !== url && item.name !== name),
          { name, url, kind },
        ],
        packAddresses: mediaFavorites.packAddresses,
      });
      setLibraryOpen("favorites");
    } catch (err) {
      console.warn('[media] creating media from a file failed', err);
      useToastStore.getState().pushToast({ title: t('media.error.upload'), body: errorReason(t, err) });
    } finally {
      setUploading(false);
    }
  };

  const markBroken = (entry: MediaEntry) => {
    setBrokenUrls((current) => current.has(entry.url) ? current : new Set(current).add(entry.url));
  };

  const classifyEntry = (entry: MediaEntry) => {
    if ((entry.kind ?? inferMediaKind(entry.url)) !== 'gif') return;
    void detectGifPresentation(entry.url).then((kind) => {
      if (kind === 'sticker') setKindOverrides((current) => current[entry.url] === kind ? current : { ...current, [entry.url]: kind });
    });
  };

  const entryKind = (entry: MediaEntry): JsMediaKind =>
    kindOverrides[entry.url] ?? entry.kind ?? (tab === 'gif' ? 'gif' : 'sticker');

  const toggleFavorite = async (entry: MediaEntry) => {
    const item: JsMediaItem = {
      name: entry.name,
      url: entry.url,
      kind: entryKind(entry),
      ...(entry.packAddress ? { packAddress: entry.packAddress } : {}),
    };
    const selected = favoriteUrls.has(entry.url);
    await nostrActions.saveMediaFavorites({
      items: selected
        ? mediaFavorites.items.filter((favorite) => favorite.url !== entry.url)
        : [...mediaFavorites.items, item],
      packAddresses: mediaFavorites.packAddresses,
    });
  };
  const favoriteMedia = (entry: MediaEntry) => {
    void toggleFavorite(entry).catch(() => {});
  };

  const pickMedia = (entry: MediaEntry) => {
    const kind = entryKind(entry);
    const presentation = kind === 'gif' ? 'gif' : 'sticker';
    const recent = { ...entry, kind, tab: presentation } as RecentMediaEntry;
    setRecentMedia(saveRecentMedia(recent));
    if (presentation === 'gif') onPick(entry.url, undefined, presentation);
    else onPick(':' + entry.name + ':', { name: entry.name, url: entry.url, ...(entry.packAddress ? { packAddress: entry.packAddress } : {}) }, presentation);
  };

  const chooseCategory = (value: MediaCategory) => {
    setCategory(value);
    setQuery('');
  };

  return {
    tab,
    setTab,
    query,
    setQuery,
    category,
    chooseCategory,
    uploading,
    libraryOpen,
    setLibraryOpen,
    emojiMaps,
    sections,
    favoriteUrls,
    createMedia,
    markBroken,
    classifyEntry,
    favoriteMedia,
    pickMedia,
  };
}
