'use client';

import { useMemo } from 'react';
import { useGroupMemberInfo } from '@/services/nostr-bridge';
import type { CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media/tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { youtubeEmbeds } from '@/utils/message-text/markdown';
import { useMessageBody } from './useMessageBody';
import { useMarkdownComponents, useMessageMediaGate } from './useMessageMedia';
import { useMarkdownBody } from './useMarkdownBody';

/**
 * One message body's view model: the remote-media gate, the pieces hoisted
 * out of the text (media, banner, invoices, game cards, YouTube embeds), the
 * markdown renderers and the on-demand markdown renderer itself (null until
 * it has loaded).
 */
export function useMessageContent({ content, channelId, customEmojis, sticker, voiceNote, authorPubkey }: {
  content: string;
  channelId?: string;
  customEmojis?: CustomEmojiMap;
  sticker?: MessageSticker;
  voiceNote?: MessageVoiceNote;
  authorPubkey?: string | null;
}) {
  const memberList = useGroupMemberInfo(channelId ?? null);
  const { media, mergedEmojis, renderEmojis } = useMessageMediaGate(authorPubkey, customEmojis);
  const body = useMessageBody({ content, sticker, voiceNote, mergedEmojis, memberList });
  const components = useMarkdownComponents(body.mentions, renderEmojis, media.show, media.reveal);
  const renderMarkdown = useMarkdownBody();
  const youtube = useMemo(() => youtubeEmbeds(body.youtubeUrls), [body.youtubeUrls]);
  return { ...body, media, components, renderMarkdown, youtube };
}
