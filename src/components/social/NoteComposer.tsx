'use client';

/**
 * Composer for notes, replies and quotes.
 *
 * Lifted from the old `ProfileComposer` (markdown buttons, Blossom upload,
 * live preview) and extended with what the feed needs: reply/quote modes, and
 * NIP-92 `imeta` tags derived from the uploaded file so other clients can
 * reserve layout space instead of janking as images load.
 */

import { useEffect, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import { uploadToBlossom } from '@/lib/blossom';
import { publishNote, publishQuote, publishReply, type Attachment } from '@/lib/social/publish';
import MessageContent from '@/components/chat/MessageContent';
import { linkifyHashtags } from '@/lib/profile-feed';

export type ComposerMode =
  | { kind: 'note' }
  | { kind: 'reply'; parent: NostrEvent }
  | { kind: 'quote'; target: NostrEvent };

export default function NoteComposer({
  mode = { kind: 'note' },
  onPublished,
  onCancel,
  autoFocus = false,
}: {
  mode?: ComposerMode;
  onPublished?: (event: NostrEvent) => void;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensitive, setSensitive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  const wrapSelection = (before: string, after = before) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const next = draft.slice(0, start) + before + draft.slice(start, end) + after + draft.slice(end);
    setDraft(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    });
  };

  /**
   * Measure the image before upload so `imeta` can carry `dim`. Reading it
   * from the local File costs nothing and is the only chance we get — once
   * it's a URL we'd have to download it again to find out.
   */
  const measure = (file: File): Promise<{ width: number; height: number } | null> => (
    new Promise((resolve) => {
      if (!file.type.startsWith('image/') || typeof URL?.createObjectURL !== 'function') {
        return resolve(null);
      }
      let settled = false;
      let url: string;
      try {
        url = URL.createObjectURL(file);
      } catch {
        return resolve(null);
      }
      const finish = (value: { width: number; height: number } | null) => {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(url); } catch { /* already revoked */ }
        resolve(value);
      };
      // Dimensions are an optimisation for `imeta`, not a precondition for
      // posting: an image that never fires load or error must not strand the
      // upload behind a promise that never settles.
      const timer = setTimeout(() => finish(null), 3000);
      const img = new Image();
      img.onload = () => { clearTimeout(timer); finish({ width: img.naturalWidth, height: img.naturalHeight }); };
      img.onerror = () => { clearTimeout(timer); finish(null); };
      img.src = url;
    })
  );

  const uploadFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const picked = [...files].slice(0, 4);
      const uploaded = await Promise.all(picked.map(async (file) => {
        const dims = await measure(file);
        const url = await uploadToBlossom(file);
        return {
          url,
          mimeType: file.type || null,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
        } satisfies Attachment;
      }));
      setAttachments((current) => [...current, ...uploaded]);
      // The bare URL stays in content — that's the universal read path for
      // every client that doesn't parse imeta.
      setDraft((current) => [current.trim(), ...uploaded.map((a) => a.url)].filter(Boolean).join('\n'));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : t('social.actionFailed'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  /**
   * Pasting a screenshot is how most images actually reach a composer, and
   * the file picker was the only way in. Drag-and-drop gets the same path.
   */
  const filesFromDataTransfer = (data: DataTransfer | null): File[] => {
    if (!data) return [];
    const files: File[] = [];
    // `items` carries pasted screenshots (which have no entry in `files` on
    // some browsers); `files` carries dragged ones. Union, then de-dupe.
    for (const item of Array.from(data.items ?? [])) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file && file.type.startsWith('image/')) files.push(file);
    }
    for (const file of Array.from(data.files ?? [])) {
      if (file.type.startsWith('image/') && !files.some((f) => f.name === file.name && f.size === file.size)) {
        files.push(file);
      }
    }
    return files;
  };

  const onPaste = (event: React.ClipboardEvent) => {
    const files = filesFromDataTransfer(event.clipboardData);
    if (files.length === 0) return;
    // Only swallow the event when we actually took an image — pasting text
    // alongside an image must still land in the textarea.
    event.preventDefault();
    void uploadFiles(files);
  };

  const onDrop = (event: React.DragEvent) => {
    const files = filesFromDataTransfer(event.dataTransfer);
    if (files.length === 0) return;
    event.preventDefault();
    setDragging(false);
    void uploadFiles(files);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || busy) return;
    setBusy(true);
    setError(null);
    try {
      // `null` means "no warning"; a string (possibly empty) triggers the
      // content-warning + #nsfw tag pair.
      const contentWarning = sensitive ? '' : null;
      let published: NostrEvent;
      if (mode.kind === 'reply') {
        published = await publishReply(mode.parent, content, { attachments, contentWarning });
      } else if (mode.kind === 'quote') {
        published = await publishQuote(mode.target, content, { attachments, contentWarning });
      } else {
        published = await publishNote(content, attachments, { contentWarning });
      }
      setDraft('');
      setAttachments([]);
      setSensitive(false);
      onPublished?.(published);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t('social.actionFailed'));
    } finally {
      setBusy(false);
    }
  };

  const placeholder = mode.kind === 'reply'
    ? t('social.replyPlaceholder')
    : mode.kind === 'quote'
      ? t('social.quotePlaceholder')
      : t('social.postPlaceholder');

  return (
    <form
      className={`rounded-xl border bg-lc-dark p-3 transition-colors ${
        dragging ? 'border-lc-green' : 'border-lc-border'
      }`}
      onSubmit={(event) => void submit(event)}
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(event) => { if (event.dataTransfer?.types?.includes('Files')) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      data-testid="note-composer"
    >
      <div className="mb-2 flex items-center gap-1">
        <button type="button" className="rounded px-2 py-1 text-sm font-bold text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('**')}>B</button>
        <button type="button" className="rounded px-2 py-1 text-sm italic text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('_')}>I</button>
        <button type="button" className="rounded px-2 py-1 text-xs text-lc-muted hover:bg-white/5 hover:text-lc-white" onClick={() => wrapSelection('[', '](https://)')}>Link</button>
        <button
          type="button"
          className={`ml-auto rounded px-2 py-1 text-xs ${sensitive ? 'text-lc-green' : 'text-lc-muted hover:text-lc-white'}`}
          onClick={() => setSensitive((value) => !value)}
          aria-pressed={sensitive}
          data-testid="composer-sensitive"
          title={t('social.markSensitive')}
        >
          {t('social.markSensitive')}
        </button>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs text-lc-muted hover:bg-white/5 hover:text-lc-white"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          + {t('profileFeed.upload')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,video/*,audio/*"
          multiple
          className="hidden"
          onChange={(event) => void uploadFiles(event.target.files)}
          data-testid="composer-files"
        />
      </div>

      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="min-h-24 w-full resize-y rounded-lg border border-lc-border bg-lc-black px-3 py-2 text-sm text-lc-white outline-none focus:border-lc-green"
        placeholder={placeholder}
        data-testid="composer-input"
      />

      {draft.trim() && (
        <div className="mt-2 rounded-lg border border-lc-border/70 bg-lc-black p-3 text-sm text-lc-white" data-testid="composer-preview">
          <MessageContent content={linkifyHashtags(draft)} wideMedia />
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-400" role="alert">{error}</p>}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-[10px] text-lc-muted">{t('profileFeed.markdownHint')}</span>
        <div className="flex gap-2">
          {onCancel && (
            <button type="button" className="lc-pill-secondary px-4 py-2 text-xs" onClick={onCancel}>
              {t('common.cancel')}
            </button>
          )}
          <button type="submit" className="lc-pill-primary px-5 py-2 text-xs" disabled={!draft.trim() || busy}>
            {busy ? t('common.saving') : t('profileFeed.publish')}
          </button>
        </div>
      </div>
    </form>
  );
}
