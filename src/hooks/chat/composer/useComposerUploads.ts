import { useState, type Dispatch, type SetStateAction } from 'react';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import type { MessageVoiceNote } from '@/utils/media-tags/voice-note-tags';
import { appendMediaUrls } from './draft-text';
import { MAX_COMPOSER_ATTACHMENTS } from './types';

export interface ComposerUploadTargets {
  setDraft: Dispatch<SetStateAction<string>>;
  setDraftSticker: Dispatch<SetStateAction<MessageSticker | null>>;
  setDraftVoiceNote: Dispatch<SetStateAction<MessageVoiceNote | null>>;
  setSendError: Dispatch<SetStateAction<string | null>>;
}

/**
 * Blossom uploads for the composer: picked or pasted files become inline
 * URLs in the draft (renderers show bare media URLs as media, NIP-92-style),
 * a recorded voice note becomes the whole draft. One upload at a time;
 * failures land in `sendError` for the skin to show.
 */
export function useComposerUploads({ setDraft, setDraftSticker, setDraftVoiceNote, setSendError }: ComposerUploadTargets) {
  const [uploading, setUploading] = useState(false);

  async function onPickFiles(files: File[]) {
    if (files.length === 0 || uploading) return;
    setDraftSticker(null);
    setDraftVoiceNote(null);
    const batch = files.slice(0, MAX_COMPOSER_ATTACHMENTS);
    setUploading(true);
    setSendError(null);
    try {
      const { uploadToBlossom } = await import('@/services/blossom');
      const urls = await Promise.all(batch.map((f) => uploadToBlossom(f)));
      setDraft((d) => appendMediaUrls(d, urls));
    } catch (err) {
      setSendError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function onVoiceRecorded(file: File, durationSeconds: number) {
    if (uploading) return;
    setUploading(true);
    setSendError(null);
    try {
      const { uploadToBlossom } = await import('@/services/blossom');
      const url = await uploadToBlossom(file);
      setDraft(url);
      setDraftSticker(null);
      setDraftVoiceNote({ url, durationSeconds });
    } catch (err) {
      setSendError((err as Error).message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  return { uploading, onPickFiles, onVoiceRecorded };
}
