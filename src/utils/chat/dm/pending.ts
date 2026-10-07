import { emojiTagsForContent, type CustomEmojiMap } from '@/utils/media/tags/custom-emoji-tags';
import { stickerTagsForContent, type MessageSticker } from '@/utils/media/tags/sticker-tags';
import type { JsDmFile } from '@/utils/attachments/dm-file';
import type { MediaPickerTab } from '../picker/media-catalog';

export interface PendingFile {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  /** Object URL of the *plaintext* file, for the preview only. */
  readonly previewUrl: string | null;
  readonly meta: JsDmFile | null;
  readonly failed?: boolean;
}

export interface PendingVoice {
  readonly meta: JsDmFile | null;
  readonly previewUrl: string;
  readonly durationSeconds: number;
}

let seq = 0;
/** A per-tab unique id for a pending file. */
export const nextId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

/** The files in a paste, in order; text and other kinds are ignored. */
export function filesFromClipboard(items: ArrayLike<DataTransferItem> | undefined): File[] {
  const pasted: File[] = [];
  for (const it of Array.from(items ?? [])) {
    if (it.kind !== 'file') continue;
    const f = it.getAsFile();
    if (f) pasted.push(f);
  }
  return pasted;
}

/** The draft after a picker pick: a sticker replaces it, a GIF goes on its own line, an emoji appends. */
export function draftAfterPick(current: string, emoji: string, kind?: MediaPickerTab): string {
  if (kind === 'sticker') return emoji;
  if (kind === 'gif') return current.trim() ? `${current.trim()}\n${emoji}` : emoji;
  return current + emoji;
}

/**
 * Tags for a DM's text: NIP-30 `emoji` tags for every custom emoji it uses,
 * and the Obelisk `sticker` tag. `emojiTagsForContent` already emits the
 * sticker's NIP-30 `emoji` tag, so only the `sticker` half is kept, as the
 * channel does.
 */
export function dmTextTags(text: string, emojis: CustomEmojiMap, sticker: MessageSticker | null): string[][] {
  return [
    ...emojiTagsForContent(text, emojis),
    ...stickerTagsForContent(text, sticker).filter((tag) => tag[0] === 'sticker'),
  ];
}
