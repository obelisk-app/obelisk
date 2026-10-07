'use client';

import { useMemo, useState } from 'react';
import { SEARCHABLE_EMOJI, normalizeEmojiKeyword } from '@/lib/emoji';
import { loadRecentEmojis, pushRecentEmoji, type RecentEmoji } from '@/services/chat/picker/recent-emojis';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { JsMediaKind } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { customEntriesFrom, filterByName, resolveRecentEntries } from '@/utils/chat/picker/custom-emoji-entries';
import { SEARCH_LIMIT } from '@/constants/chat/picker';
import type { PickedCustomEmoji } from '@/utils/chat/picker/picker-types';
import type { RecentPickerEntry } from '@/utils/chat/picker/custom-emoji-entries';

/**
 * Search, recents and the custom set of the emoji picker, split by kind.
 * Falls back to the relay's emoji set from the store when the host passes
 * none. Picking records a recent unless `skipRecent`.
 */
export function useEmojiPicker({
  customEmojis: customEmojisProp,
  customMediaKinds: customMediaKindsProp,
  skipRecent,
  onPick,
}: {
  customEmojis?: CustomEmojiMap;
  customMediaKinds?: Readonly<Record<string, JsMediaKind>>;
  skipRecent: boolean;
  onPick: (emoji: string, custom?: PickedCustomEmoji) => void;
}) {
  const [query, setQuery] = useState('');
  const [recents, setRecents] = useState<RecentEmoji[]>(() => loadRecentEmojis());
  const storeCustomEmojis = useChatStore((s) => s.serverEmojis);
  const storeMediaKinds = useChatStore((s) => s.serverMediaKinds);
  const customEmojis = customEmojisProp ?? storeCustomEmojis;
  const customMediaKinds = customMediaKindsProp ?? storeMediaKinds;

  const q = normalizeEmojiKeyword(query.trim());
  const filtered = useMemo(() => {
    if (!q) return null;
    return SEARCHABLE_EMOJI.filter((e) => e.haystack.includes(q)).slice(0, SEARCH_LIMIT);
  }, [q]);
  const customEntries = useMemo(
    () => customEntriesFrom(customEmojis, customMediaKinds),
    [customEmojis, customMediaKinds],
  );
  const customGifEntries = useMemo(
    () => customEntries.filter((entry) => entry.kind === "gif"),
    [customEntries],
  );
  const customStickerEntries = useMemo(
    () => customEntries.filter((entry) => entry.kind === "sticker"),
    [customEntries],
  );
  const customEmojiEntries = useMemo(
    () => customEntries.filter((entry) => entry.kind === "emoji"),
    [customEntries],
  );
  const filteredCustomGifEntries = useMemo(() => filterByName(customGifEntries, q), [customGifEntries, q]);
  const filteredCustomStickerEntries = useMemo(() => filterByName(customStickerEntries, q), [customStickerEntries, q]);
  const filteredCustomEmojiEntries = useMemo(() => filterByName(customEmojiEntries, q), [customEmojiEntries, q]);
  const filteredCustomCount = filteredCustomGifEntries.length + filteredCustomStickerEntries.length + filteredCustomEmojiEntries.length;
  const recentEntries = useMemo(
    () => resolveRecentEntries(recents, customEntries),
    [customEntries, recents],
  );

  const handlePick = (emoji: string) => {
    if (!skipRecent) setRecents(pushRecentEmoji(emoji));
    onPick(emoji);
  };
  const handlePickCustom = (emoji: PickedCustomEmoji) => {
    const shortcode = `:${emoji.name}:`;
    if (!skipRecent) {
      setRecents(pushRecentEmoji(shortcode, { url: emoji.url, ...(emoji.packAddress ? { packAddress: emoji.packAddress } : {}) }));
    }
    onPick(shortcode, emoji);
  };

  return {
    query,
    setQuery,
    filtered,
    customGifEntries,
    customStickerEntries,
    customEmojiEntries,
    filteredCustomGifEntries,
    filteredCustomStickerEntries,
    filteredCustomEmojiEntries,
    filteredCustomCount,
    recentEntries,
    handlePick,
    handlePickCustom,
    /** A Recent entry: a custom pick goes back as custom media, anything else as its character. */
    handlePickRecent: (entry: RecentPickerEntry) => (entry.custom ? handlePickCustom(entry.custom) : handlePick(entry.char)),
  };
}
