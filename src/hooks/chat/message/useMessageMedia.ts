'use client';

import { useMemo } from 'react';
import type { Components } from 'react-markdown';
import { useChatStore } from '@/store/chat';
import { useRemoteMediaGate, type RemoteMediaGate } from '@/services/media/remote-media-gate';
import { mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { buildMarkdownComponents } from '@/components/chat/message/markdown-components';
import type { MentionMap } from '@/utils/message-text/placeholder-segments';

/**
 * The remote-media gate for one message and the emoji set it may render.
 *
 * Passing `authorPubkey` (even as `null`, "unknown") turns the gate on;
 * omitting it keeps everything loading, which is right only for content the
 * reader wrote themselves. See `src/services/media/remote-media.ts`.
 */
export function useMessageMediaGate(authorPubkey: string | null | undefined, customEmojis?: CustomEmojiMap) {
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const mergedEmojis = useMemo(
    () => mergeCustomEmojiMaps(serverEmojis, customEmojis),
    [serverEmojis, customEmojis],
  );
  const gate = useRemoteMediaGate('channel', authorPubkey ?? null);
  const media: RemoteMediaGate = authorPubkey === undefined
    ? { show: true, gated: false, reveal: gate.reveal }
    : gate;
  // Server emojis are relay-admin URLs on a relay that already holds this
  // socket. The message's own emoji tags are sender-chosen URLs: while the
  // gate is closed they fall back to their `:name:` text.
  const renderEmojis = media.show ? mergedEmojis : serverEmojis;
  return { media, mergedEmojis, renderEmojis };
}

/**
 * The react-markdown renderers, rebuilt only when what they close over
 * changes, so a memoised message row hands react-markdown the same object
 * on every unrelated re-render.
 */
export function useMarkdownComponents(
  mentions: MentionMap,
  renderEmojis: Record<string, string>,
  mediaShow: boolean,
  mediaReveal: () => void,
): Components {
  return useMemo(
    () => buildMarkdownComponents({ mentions, renderEmojis, mediaShow, mediaReveal }),
    [mentions, renderEmojis, mediaShow, mediaReveal],
  );
}
