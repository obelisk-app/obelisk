'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadToBlossom } from '@/services/media/blossom';
import { isValidCustomEmojiName, normalizeCustomEmojiName } from '@/utils/media/tags/custom-emoji-tags';
import { nostrActions } from '@/services/nostr-bridge';
import type { JsMediaItem, JsMediaKind } from '@/services/nostr-bridge';
import { uniqueName } from '@/utils/media/library/pack-utils';
import { isHttpUrl } from '@/utils/url/http-url';
import type { EditablePack } from '@/types/media/library';
import { takePickedFiles } from '@/utils/media/upload/picked-file';

/**
 * The draft behind the pack editor: uploads become items with unique
 * shortcodes, and save refuses a pack with no name, a bad shortcode, a
 * non-HTTP(S) URL or a duplicate before anything is signed.
 */
export function usePackEditor(
  pack: EditablePack,
  initialKind: JsMediaKind,
  onSaved: (pack: EditablePack) => Promise<void>,
) {
  const t = useTranslations();
  const [draft, setDraft] = useState<EditablePack>({ ...pack, items: [...pack.items] });
  const [newItemKind, setNewItemKind] = useState<JsMediaKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: ArrayLike<File> | null) => {
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (images.length === 0) return;
    setBusy(true);
    setError(null);
    const used = new Set(draft.items.map((item) => item.name));
    try {
      const added: JsMediaItem[] = [];
      for (const file of images) {
        const url = await uploadToBlossom(file);
        added.push({ name: uniqueName(file.name, used), url, kind: newItemKind });
      }
      setDraft((current) => ({ ...current, items: [...current.items, ...added] }));
    } catch (cause) {
      console.warn('[media] pack upload failed', cause);
      setError(t('media.error.uploadFailed'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) return setError(t('media.error.nameRequired'));
    const names = new Set<string>();
    for (const item of draft.items) {
      const name = normalizeCustomEmojiName(item.name);
      if (!isValidCustomEmojiName(name) || !isHttpUrl(item.url)) return setError(t('media.error.invalidItems'));
      if (names.has(name)) return setError(t('media.error.duplicate', { name }));
      names.add(name);
    }
    setBusy(true);
    setError(null);
    try {
      const saved = { ...draft, title, items: draft.items.map((item) => ({ ...item, name: normalizeCustomEmojiName(item.name) })) };
      await nostrActions.saveMediaPack(saved);
      await onSaved(saved);
    } catch (cause) {
      console.warn('[media] saving the pack failed', cause);
      setError(t('media.error.savePack'));
    } finally {
      setBusy(false);
    }
  };

  const updateItem = (index: number, patch: Partial<JsMediaItem>) => {
    setDraft({ ...draft, items: draft.items.map((value, itemIndex) => itemIndex === index ? { ...value, ...patch } : value) });
  };
  const removeItem = (index: number) => {
    setDraft({ ...draft, items: draft.items.filter((_, itemIndex) => itemIndex !== index) });
  };
  const addUrlItem = () => {
    setDraft({ ...draft, items: [...draft.items, { name: '', url: '', kind: newItemKind }] });
  };

  /** A file input's change: add its images, then clear it so the same files can be picked again. */
  const filesPicked = (input: HTMLInputElement) => {
    void addFiles(takePickedFiles(input));
  };

  return { draft, setDraft, newItemKind, setNewItemKind, busy, error, addFiles, filesPicked, save, updateItem, removeItem, addUrlItem };
}
