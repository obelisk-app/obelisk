'use client';

import { useMemo } from 'react';
import { useChatStore } from '@/store/chat';
import { mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';

/**
 * The emoji a DM may draw. Server emojis are relay-admin URLs on a relay
 * that already holds this socket; the message's own emoji tags are
 * sender-chosen URLs and wait with the rest of the media, falling back to
 * their `:name:` text.
 */
export function useDmEmojis(messageEmojis: CustomEmojiMap | undefined, mediaShow: boolean): Record<string, string> {
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  return useMemo(
    () => (mediaShow ? mergeCustomEmojiMaps(serverEmojis, messageEmojis ?? {}) : serverEmojis),
    [serverEmojis, messageEmojis, mediaShow],
  );
}
