import { emojiTagsForContent, mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { stickerTagsForContent, type MessageSticker } from '@/utils/media/tags/sticker-tags';
import { voiceNoteTagForContent, type MessageVoiceNote } from '@/utils/media/tags/voice-note-tags';
import { SLASH_COMMANDS, type SlashCommand } from '@/utils/chat/slash/slash-commands';
import type { MediaPickerTab } from '@/utils/chat/picker/media-catalog';

/**
 * The composer's pure text rules: what a draft looks like after an upload,
 * a removal or a pick, which built-in command it starts with, and the tags
 * an outgoing message carries. No React here, so each rule is testable alone.
 */

/** `/<partial>` and nothing else: the slash picker's query, or `null`. */
export function slashQueryOf(value: string): string | null {
  const m = /^\/([a-zA-Z0-9_-]*)$/.exec(value);
  return m ? m[1] : null;
}

/** The built-in command a draft starts with (`/zap 100` is `zap`), if any. */
export function builtinCommandOf(value: string): SlashCommand | null {
  const m = /^\/([a-zA-Z]+)(?:\s|$)/.exec(value);
  if (!m) return null;
  return SLASH_COMMANDS.find((c) => c.name === m[1].toLowerCase()) ?? null;
}

/** Inline-attach: each uploaded URL on its own line after the trimmed draft. */
export function appendMediaUrls(draft: string, urls: ReadonlyArray<string>): string {
  const base = draft.trim();
  return base ? `${base}\n${urls.join('\n')}` : urls.join('\n');
}

/** Drop the line holding `url`, collapsing the gap it leaves. */
export function removeUrlLine(draft: string, url: string): string {
  return draft
    .split('\n')
    .filter((line) => line.trim() !== url)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

/** A picked sticker replaces the draft, a GIF goes on its own line, an emoji is appended. */
export function withPickedMedia(draft: string, emoji: string, kind?: MediaPickerTab): string {
  if (kind === 'sticker') return emoji;
  if (kind === 'gif') return draft.trim() ? [draft.trim(), emoji].join('\n') : emoji;
  return draft + emoji;
}

/** The image and video files in a paste, in order. */
export function pastedMediaFiles(items: ReadonlyArray<DataTransferItem>): File[] {
  const files: File[] = [];
  for (const it of items) {
    if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f && (f.type.startsWith('image/') || f.type.startsWith('video/'))) files.push(f);
    }
  }
  return files;
}

/** Custom emoji, sticker and voice-note tags for the text that goes on the wire. */
export function outgoingTags(
  wire: string,
  media: {
    serverEmojis: CustomEmojiMap;
    draftCustomEmojis: CustomEmojiMap;
    draftSticker: MessageSticker | null;
    draftVoiceNote: MessageVoiceNote | null;
  },
): string[][] {
  const voiceTag = voiceNoteTagForContent(wire, media.draftVoiceNote);
  return [
    ...emojiTagsForContent(wire, mergeCustomEmojiMaps(media.serverEmojis, media.draftCustomEmojis)),
    ...stickerTagsForContent(wire, media.draftSticker).filter((tag) => tag[0] === 'sticker'),
    ...(voiceTag ? [voiceTag] : []),
  ];
}
