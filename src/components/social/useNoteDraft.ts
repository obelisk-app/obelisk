'use client';

/**
 * The engine behind every composer: draft text, uploads, and publishing.
 *
 * There are two composers, because writing a note on a desktop and writing
 * one on a phone are different jobs. Desktop composes *in place* — a card
 * that expands where the compose row was, next to the feed you're replying
 * to, with a live preview and a mouse-sized toolbar. Mobile composes
 * *full-screen* — the keyboard takes half the viewport, so a card floating in
 * a modal leaves a ~120px writing slot, and the toolbar has to be thumb-sized
 * and above the keyboard rather than a row of 24px text buttons.
 *
 * Forking the presentation twice is the point; forking the publish path would
 * be how the two drift. Everything that touches the relay, Blossom, or NIP-92
 * `imeta` lives here and is shared.
 */

import { useEffect, useRef, useState } from 'react';
import type { Event as NostrEvent } from 'nostr-tools';
import { useTranslation } from '@/i18n/context';
import { uploadToBlossom } from '@/lib/blossom';
import { publishNote, publishQuote, publishReply, type Attachment } from '@/lib/social/publish';

export type ComposerMode =
  | { kind: 'note' }
  | { kind: 'reply'; parent: NostrEvent }
  | { kind: 'quote'; target: NostrEvent };

/** How many files one paste/drop/pick can add. */
const MAX_FILES = 4;

/**
 * Measure an image before upload so `imeta` can carry `dim`. Reading it from
 * the local File costs nothing and is the only chance we get — once it's a
 * URL we'd have to download it again to find out.
 */
function measure(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
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
  });
}

/**
 * Pasting a screenshot is how most images actually reach a composer, and the
 * file picker used to be the only way in. Drag-and-drop shares this path.
 */
export function filesFromDataTransfer(data: DataTransfer | null): File[] {
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
}

export function useNoteDraft({
  mode = { kind: 'note' },
  onPublished,
  autoFocus = false,
}: {
  mode?: ComposerMode;
  onPublished?: (event: NostrEvent) => void;
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

  /** Wrap the selection in markdown, keeping the caret where the writer left it. */
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

  const uploadFiles = async (files: FileList | File[] | null) => {
    if (!files?.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      const picked = [...files].slice(0, MAX_FILES);
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

  const onDragOver = (event: React.DragEvent) => {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    setDragging(true);
  };

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
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

  return {
    draft,
    setDraft,
    attachments,
    busy,
    error,
    sensitive,
    setSensitive,
    dragging,
    setDragging,
    textareaRef,
    fileRef,
    wrapSelection,
    uploadFiles,
    onPaste,
    onDrop,
    onDragOver,
    submit,
    placeholder,
    canPost: draft.trim().length > 0 && !busy,
  };
}
