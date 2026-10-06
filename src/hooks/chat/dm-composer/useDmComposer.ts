'use client';

import { useState, type RefObject } from 'react';
import { useTranslation } from '@/i18n/context';
import { nostrActions } from '@/services/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { mergeCustomEmojiMaps, type CustomEmojiMap } from '@/utils/media-tags/custom-emoji-tags';
import type { MessageSticker } from '@/utils/media-tags/sticker-tags';
import { checkDmAttachment, encryptAndUploadDmFile } from '@/services/dm-attachments';
import { dmFileCategory } from '@/utils/attachments/dm-file';
import type { MediaPickerTab } from '@/utils/chat/picker/media-catalog';
import { usePreviewUrls } from './usePreviewUrls';
import {
  MAX_PENDING,
  draftAfterPick,
  dmTextTags,
  filesFromClipboard,
  nextId,
  type PendingFile,
  type PendingVoice,
} from '@/utils/chat/dm/pending';

/**
 * Draft, pending encrypted uploads, voice note and picker state of a DM
 * composer, with every action that changes them. Files and voice notes
 * are encrypted and uploaded as soon as they are added, and sent as their
 * own kind-15 file messages; NIP-04 threads accept neither. `inputRef` is
 * the text field, focused again after a pick.
 */
export function useDmComposer(peer: string, inputRef: RefObject<HTMLInputElement | null>) {
  const { t } = useTranslation();
  const serverEmojis = useChatStore((s) => s.serverEmojis);
  const protocol = useDMStore((s) => s.protocolOverrides[peer]) ?? 'nip17';
  const mediaAllowed = protocol === 'nip17';
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [voice, setVoice] = useState<PendingVoice | null>(null);
  const [sticker, setSticker] = useState<MessageSticker | null>(null);
  const [customEmojis, setCustomEmojis] = useState<CustomEmojiMap>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<MediaPickerTab>('emoji');
  const [error, setError] = useState<string | null>(null);
  const { preview, release } = usePreviewUrls();

  const uploading = files.some((f) => !f.meta && !f.failed) || (voice !== null && !voice.meta);

  function addFiles(picked: File[]) {
    if (!mediaAllowed || picked.length === 0) return;
    setError(null);
    setSticker(null);
    const room = MAX_PENDING - files.length;
    const batch = picked.slice(0, Math.max(0, room));
    for (const file of batch) {
      const problem = checkDmAttachment(file);
      if (problem) {
        setError(problem === 'size' ? t('dm.file.tooLarge') : t('dm.file.badType'));
        continue;
      }
      const id = nextId();
      const category = dmFileCategory(file.type);
      const entry: PendingFile = {
        id,
        name: file.name,
        mime: file.type,
        previewUrl: category === 'image' || category === 'video' ? preview(file) : null,
        meta: null,
      };
      setFiles((cur) => [...cur, entry]);
      encryptAndUploadDmFile(file).then(
        (meta) => setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, meta } : f))),
        () => {
          setFiles((cur) => cur.map((f) => (f.id === id ? { ...f, failed: true } : f)));
          setError(t('dm.file.uploadFailed'));
        },
      );
    }
  }

  function removeFile(id: string) {
    setFiles((cur) => {
      const gone = cur.find((f) => f.id === id);
      if (gone) release(gone.previewUrl);
      return cur.filter((f) => f.id !== id);
    });
  }

  function onVoiceRecorded(file: File, durationSeconds: number) {
    if (!mediaAllowed) return;
    setError(null);
    const url = preview(file);
    if (!url) return;
    setVoice({ meta: null, previewUrl: url, durationSeconds });
    encryptAndUploadDmFile(file, { durationSeconds }).then(
      (meta) => setVoice((cur) => (cur && cur.previewUrl === url ? { ...cur, meta } : cur)),
      () => {
        release(url);
        setVoice(null);
        setError(t('dm.file.uploadFailed'));
      },
    );
  }

  function discardVoice() {
    if (voice) release(voice.previewUrl);
    setVoice(null);
  }

  function send() {
    if (uploading) return;
    const text = draft.trim();
    const ready = files.filter((f) => f.meta);
    if (!text && ready.length === 0 && !voice?.meta) return;
    // Optimistic, like the text path: the bridge inserts a pending bubble per
    // message and each bubble carries its own retry.
    if (voice?.meta) {
      void nostrActions.sendDirectFile(peer, voice.meta).catch((err) => setError((err as Error).message));
      release(voice.previewUrl);
      setVoice(null);
    }
    for (const f of ready) {
      void nostrActions.sendDirectFile(peer, f.meta!).catch((err) => setError((err as Error).message));
      release(f.previewUrl);
    }
    setFiles((cur) => cur.filter((f) => !f.meta));
    if (text) {
      const tags = dmTextTags(text, mergeCustomEmojiMaps(serverEmojis, customEmojis), sticker);
      void nostrActions.sendDirectMessage(peer, text, tags).catch((err) => {
        console.warn('[dm] sendDirectMessage scheduling failed', err);
      });
    }
    setDraft('');
    setSticker(null);
  }

  function onPick(emoji: string, custom?: { name: string; url: string; packAddress?: string }, kind?: MediaPickerTab) {
    setDraft((cur) => draftAfterPick(cur, emoji, kind));
    setSticker(kind === 'sticker' && custom ? custom : null);
    if (custom) setCustomEmojis((cur) => ({ ...cur, [custom.name]: custom.url }));
    setPickerOpen(false);
    inputRef.current?.focus();
  }

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!mediaAllowed) return;
    const pasted = filesFromClipboard(e.clipboardData?.items);
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const typeDraft = (value: string) => { setDraft(value); setSticker(null); };
  const appendContact = (value: string) => {
    setSticker(null);
    setDraft((cur) => cur + (cur ? ' ' : '') + 'nostr:' + value);
  };
  const openPicker = (tab: MediaPickerTab) => { setPickerTab(tab); setPickerOpen(true); };
  const togglePicker = () => { setPickerTab('emoji'); setPickerOpen((v) => !v); };
  const closePicker = () => setPickerOpen(false);

  const canSend = !uploading && (draft.trim().length > 0 || files.some((f) => f.meta) || Boolean(voice?.meta));

  return {
    mediaAllowed,
    draft,
    files,
    voice,
    error,
    pickerOpen,
    pickerTab,
    pickerEmojis: mergeCustomEmojiMaps(serverEmojis, customEmojis),
    canSend,
    addFiles,
    removeFile,
    onVoiceRecorded,
    discardVoice,
    send,
    onPick,
    onPaste,
    typeDraft,
    appendContact,
    openPicker,
    togglePicker,
    closePicker,
  };
}

export type DmComposerState = ReturnType<typeof useDmComposer>;
