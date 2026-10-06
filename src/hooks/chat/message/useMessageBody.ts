'use client';

import { useMemo } from 'react';
import { preprocessForMarkdown } from '@/utils/message-text/markdown';
import { replaceShortcodes } from '@/utils/message-text/emoji-shortcodes';
import { extractGameMarkers } from '@/lib/games/protocol';
import type { MemberInfo } from '@/utils/message-text/mentions';
import type { JsMemberInfo } from '@/services/nostr-bridge';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media-tags/voice-note-tags';
import { findInvoices, findWelcomeBanner, hoistUrls, stripHoisted } from '@/components/chat/message/hoist';

/**
 * Split a message into what renders below the text (media, banner,
 * invoices, game cards) and the markdown body that is left, with
 * shortcodes and mentions already swapped for placeholders.
 */
export function useMessageBody({
  content,
  sticker,
  voiceNote,
  mergedEmojis,
  memberList,
}: {
  content: string;
  sticker?: MessageSticker;
  voiceNote?: MessageVoiceNote;
  mergedEmojis: Record<string, string>;
  memberList: ReadonlyArray<JsMemberInfo>;
}) {
  // Hoist image + video + audio URLs out of the message body so we can
  // render them as a gallery / inline player below the text. Without this,
  // each URL would render inline wherever it appears in the markdown.
  const { imageUrls, videoUrls, audioUrls, youtubeUrls, linkUrls } = useMemo(
    () => hoistUrls(content, Boolean(voiceNote)),
    [content, voiceNote],
  );

  // Detect and hoist the welcome banner markdown image.
  const welcomeBanner = useMemo(() => findWelcomeBanner(content), [content]);

  // Hoist BOLT11 invoices out of the body so each renders as an InvoiceCard
  // below the text instead of a raw lnbc… blob inline.
  const invoices = useMemo(() => findInvoices(content), [content]);

  // Hoist `[[game:<id>]]` markers out of the body: the host posts one when
  // they open a table, and it renders as a card whose status is replayed from
  // the table's own event log rather than frozen into this message.
  const gameIds = useMemo(() => extractGameMarkers(content), [content]);

  const bodyContent = useMemo(() => {
    if (sticker || voiceNote) return '';
    return stripHoisted(content, {
      urls: [...imageUrls, ...videoUrls, ...audioUrls, ...youtubeUrls],
      welcomeBanner,
      invoices,
      hasGames: gameIds.length > 0,
    });
  }, [content, imageUrls, videoUrls, audioUrls, youtubeUrls, welcomeBanner, invoices, gameIds, sticker, voiceNote]);

  // Resolve `:name:` shortcodes before markdown parsing. Unicode shortcodes
  // are replaced inline (no placeholder: the char is just a char), while
  // custom server emojis are replaced with placeholder tokens that
  // `processChildren` swaps for <img> elements, mirroring mentions.
  const shortcodeResolved = useMemo(
    () => replaceShortcodes(bodyContent, mergedEmojis),
    [bodyContent, mergedEmojis],
  );

  const { text, mentions } = useMemo(
    () => preprocessForMarkdown(shortcodeResolved, memberList as MemberInfo[]),
    [shortcodeResolved, memberList],
  );

  return {
    imageUrls,
    videoUrls,
    audioUrls,
    youtubeUrls,
    linkUrls,
    welcomeBanner,
    invoices,
    gameIds,
    text,
    mentions,
  };
}
