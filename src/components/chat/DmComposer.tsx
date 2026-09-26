'use client';

/**
 * Mount with `key={peer}`: a draft and anything pending belong to the
 * conversation they were started in, and remounting is how they are dropped.
 *
 * The message bar for a DM thread — the same bar a channel has (attachments,
 * voice notes, emoji / GIF / sticker picker, drop and paste), with one
 * difference that matters: every file and voice note is encrypted in the
 * browser before it is uploaded.
 *
 * Group composers put a Blossom URL straight into the draft, because the URL
 * *is* the attachment. Here the URL points at ciphertext and renders as
 * nothing, so uploads are held as pending `JsDmFile`s beside the draft and
 * each one is sent as its own NIP-17 kind-15 file message. Previews read from
 * a local object URL of the original file, which never leaves the tab.
 *
 * Stickers, GIFs and custom emoji are references to public pack / GIF URLs,
 * exactly as in a channel — what is private is that *you sent them to this
 * person*, and that rides inside the gift wrap like the text does.
 *
 * NIP-04 threads have no file message, so the attach and voice controls are
 * hidden there rather than failing on send.
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from '@/i18n/context';
import { nostrActions } from '@/lib/nostr-bridge';
import { useChatStore } from '@/store/chat';
import { useDMStore } from '@/store/dm';
import { MESSAGE_INPUT_PROPS } from '@/lib/message-input-props';
import MessageMediaPicker, { type MediaPickerTab } from '@/components/chat/MessageMediaPicker';
import { AttachmentMenu, FileDropZone, StickerIcon, VoiceNoteButton } from '@/components/chat/ComposerActions';
import { emojiTagsForContent, mergeCustomEmojiMaps, type CustomEmojiMap } from '@/lib/custom-emoji-tags';
import { stickerTagsForContent, type MessageSticker } from '@/lib/sticker-tags';
import { checkDmAttachment, encryptAndUploadDmFile } from '@/lib/dm-attachments';
import { dmFileCategory, type JsDmFile } from '@/lib/dm-file';
import { FileIcon, LockIcon, TrashIcon } from '@/components/ui/icons';
import { VoiceMessage } from '@/components/chat/MessageContent';

const MAX_PENDING = 4;

interface PendingFile {
  readonly id: string;
  readonly name: string;
  readonly mime: string;
  /** Object URL of the *plaintext* file, for the preview only. */
  readonly previewUrl: string | null;
  readonly meta: JsDmFile | null;
  readonly failed?: boolean;
}

interface PendingVoice {
  readonly meta: JsDmFile | null;
  readonly previewUrl: string;
  readonly durationSeconds: number;
}

let seq = 0;
const nextId = () => `f${Date.now().toString(36)}${(seq++).toString(36)}`;

export function DmComposer({ peer, variant }: { peer: string; variant: 'desktop' | 'mobile' }) {
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
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  // Every object URL this composer minted, so unmount can revoke the lot.
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    const urls = previewUrls.current;
    return () => { for (const u of urls) URL.revokeObjectURL(u); urls.clear(); };
  }, []);

  useEffect(() => {
    if (!pickerOpen || variant !== 'desktop') return;
    const onDoc = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [pickerOpen, variant]);

  const preview = (file: Blob) => {
    try {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return url;
    } catch {
      return null;
    }
  };
  const release = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    previewUrls.current.delete(url);
  };

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
      const tags = [
        ...emojiTagsForContent(text, mergeCustomEmojiMaps(serverEmojis, customEmojis)),
        // `emojiTagsForContent` already emits the sticker's NIP-30 `emoji`
        // tag; keep only the Obelisk `sticker` half, as the channel does.
        ...stickerTagsForContent(text, sticker).filter((tag) => tag[0] === 'sticker'),
      ];
      void nostrActions.sendDirectMessage(peer, text, tags).catch((err) => {
        console.warn('[dm] sendDirectMessage scheduling failed', err);
      });
    }
    setDraft('');
    setSticker(null);
  }

  function onPick(emoji: string, custom?: { name: string; url: string; packAddress?: string }, kind?: MediaPickerTab) {
    if (kind === 'sticker') setDraft(emoji);
    else if (kind === 'gif') setDraft((cur) => (cur.trim() ? `${cur.trim()}\n${emoji}` : emoji));
    else setDraft((cur) => cur + emoji);
    setSticker(kind === 'sticker' && custom ? custom : null);
    if (custom) setCustomEmojis((cur) => ({ ...cur, [custom.name]: custom.url }));
    setPickerOpen(false);
    inputRef.current?.focus();
  }

  const canSend = !uploading && (draft.trim().length > 0 || files.some((f) => f.meta) || Boolean(voice?.meta));

  const onPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    if (!mediaAllowed) return;
    const pasted: File[] = [];
    for (const it of Array.from(e.clipboardData?.items ?? [])) {
      if (it.kind !== 'file') continue;
      const f = it.getAsFile();
      if (f) pasted.push(f);
    }
    if (pasted.length > 0) {
      e.preventDefault();
      addFiles(pasted);
    }
  };

  const pendingStrip = (files.length > 0) && (
    <div
      className={variant === 'desktop'
        ? 'mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-lc-border bg-lc-card/50 p-2'
        : 'flex flex-wrap items-center gap-2 px-3 pb-2'}
      data-testid="dm-pending-files"
    >
      {files.map((f) => (
        <div key={f.id} className="group relative h-16 w-16 overflow-hidden rounded-lg bg-lc-black" data-testid="dm-pending-file">
          {f.previewUrl && f.mime.startsWith('image/') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={f.previewUrl} alt="" className="h-full w-full object-cover" />
          ) : f.previewUrl && f.mime.startsWith('video/') ? (
            <video src={f.previewUrl} muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-lc-white">
              <FileIcon size={18} />
              <span className="w-full truncate text-center text-[9px]">{f.name}</span>
            </div>
          )}
          {!f.meta && !f.failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/55" role="status" aria-label={t('dm.file.uploading')}>
              <span className="lc-spinner h-4 w-4" />
            </div>
          )}
          {f.failed && (
            <div className="absolute inset-0 flex items-center justify-center bg-red-900/60 text-[10px] font-semibold text-white">!</div>
          )}
          {f.meta && (
            <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 p-0.5 text-lc-green" aria-hidden="true">
              <LockIcon size={10} />
            </span>
          )}
          <button
            type="button"
            onClick={() => removeFile(f.id)}
            className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-lc-white hover:bg-black"
            aria-label={t('desktop.composer.removeAttachment')}
          >
            <TrashIcon size={11} />
          </button>
        </div>
      ))}
    </div>
  );

  const voiceDraft = voice && (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="dm-voice-draft">
      <VoiceMessage note={{ url: voice.previewUrl, durationSeconds: voice.durationSeconds }} compact />
      {!voice.meta && <span className="lc-spinner h-4 w-4 shrink-0" role="status" aria-label={t('dm.file.uploading')} />}
      <button
        type="button"
        onClick={discardVoice}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lc-muted hover:bg-red-500/10 hover:text-red-400"
        aria-label={t('composer.discardVoice')}
        title={t('composer.discardVoice')}
      >
        <TrashIcon size={18} />
      </button>
    </div>
  );

  const actions = !voice && (
    <>
      {mediaAllowed && (
        <AttachmentMenu
          disabled={files.length >= MAX_PENDING}
          onFiles={addFiles}
          onContact={(value) => {
            setSticker(null);
            setDraft((cur) => cur + (cur ? ' ' : '') + 'nostr:' + value);
          }}
          onNewSticker={() => { setPickerTab('sticker'); setPickerOpen(true); }}
        />
      )}
      {variant === 'desktop' ? (
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => { setPickerTab('emoji'); setPickerOpen((v) => !v); }}
            className="flex h-9 w-9 items-center justify-center rounded-full text-lc-muted hover:bg-white/5 hover:text-lc-white"
            aria-label={t('mobile.composer.openPicker')}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
          >
            <StickerIcon />
          </button>
          {pickerOpen && (
            <MessageMediaPicker
              initialTab={pickerTab}
              customEmojis={mergeCustomEmojiMaps(serverEmojis, customEmojis)}
              onPick={onPick}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      ) : (
        <button
          type="button"
          className="composer-emoji"
          aria-label={t('mobile.composer.openPicker')}
          onClick={() => { setPickerTab('emoji'); setPickerOpen(true); }}
        >
          <StickerIcon />
        </button>
      )}
    </>
  );

  const input = (
    <input
      {...MESSAGE_INPUT_PROPS}
      ref={inputRef}
      value={draft}
      onChange={(e) => { setDraft(e.target.value); setSticker(null); }}
      onPaste={onPaste}
      onKeyDown={(e) => {
        if (variant === 'mobile' && e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      }}
      placeholder={t('dm.placeholderEncrypted')}
      data-testid="dm-composer-input"
      className={variant === 'desktop'
        ? (voice ? 'hidden ' : '') + 'w-full bg-transparent text-sm text-lc-white outline-none placeholder:text-lc-muted'
        : voice ? 'hidden' : 'composer-input'}
    />
  );

  const sendButton = canSend || draft.trim() || files.length > 0 || voice ? (
    <button
      type={variant === 'desktop' ? 'submit' : 'button'}
      onClick={variant === 'mobile' ? () => send() : undefined}
      disabled={!canSend}
      className={variant === 'desktop'
        ? 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lc-green text-lc-black disabled:opacity-30'
        : 'composer-send'}
      aria-label={t('common.send')}
      data-testid="dm-send"
    >
      <svg className={variant === 'desktop' ? 'h-5 w-5' : undefined} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 14-7-7 14-2-5-5-2z" /></svg>
    </button>
  ) : mediaAllowed ? (
    <VoiceNoteButton onRecorded={onVoiceRecorded} />
  ) : null;

  if (variant === 'mobile') {
    return (
      <div className="composer" data-testid="dm-composer">
        {error && <p className="px-3 pb-1 text-xs text-red-400" role="alert">{error}</p>}
        {pendingStrip}
        <div className="composer-inner">
          {actions}
          {voiceDraft}
          {input}
          <div className="composer-btns">{sendButton}</div>
        </div>
        {pickerOpen && (
          <div className="emoji-sheet-host" onClick={() => setPickerOpen(false)}>
            <div className="emoji-sheet native-scroll-y" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <MessageMediaPicker
                variant="sheet"
                initialTab={pickerTab}
                customEmojis={mergeCustomEmojiMaps(serverEmojis, customEmojis)}
                onPick={onPick}
                onClose={() => setPickerOpen(false)}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <FileDropZone disabled={!mediaAllowed} onFiles={addFiles} className="shrink-0">
      <form
        onSubmit={(e) => { e.preventDefault(); send(); }}
        className="px-5 pt-3 pb-3"
        data-testid="dm-composer"
      >
        {error && <p className="mb-2 break-words text-xs text-red-400" role="alert">{error}</p>}
        {pendingStrip}
        <div className="flex min-h-[3.5rem] items-center gap-1 rounded-xl border border-lc-border bg-lc-card px-2 focus-within:border-lc-green">
          {actions}
          <div className="relative flex flex-1 items-center">
            {voiceDraft}
            {input}
          </div>
          {sendButton}
        </div>
      </form>
    </FileDropZone>
  );
}
