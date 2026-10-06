'use client';

import { useState } from 'react';
import { uploadToBlossom } from '@/services/blossom';
import { isValidCustomEmojiName, normalizeCustomEmojiName } from '@/utils/media-tags/custom-emoji-tags';
import { nostrActions } from '@/services/nostr-bridge';
import type { JsMediaItem, JsMediaKind } from '@/services/nostr-bridge';
import { uniqueName, validHttpUrl } from '@/components/media/library/pack-utils';
import type { EditablePack } from '@/components/media/library/types';

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
  const [draft, setDraft] = useState<EditablePack>({ ...pack, items: [...pack.items] });
  const [newItemKind, setNewItemKind] = useState<JsMediaKind>(initialKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFiles = async (files: FileList | null) => {
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
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const title = draft.title.trim();
    if (!title) return setError('Pack name is required.');
    const names = new Set<string>();
    for (const item of draft.items) {
      const name = normalizeCustomEmojiName(item.name);
      if (!isValidCustomEmojiName(name) || !validHttpUrl(item.url)) return setError('Every item needs a unique shortcode and HTTP(S) image URL.');
      if (names.has(name)) return setError(`Duplicate shortcode: :${name}:`);
      names.add(name);
    }
    setBusy(true);
    setError(null);
    try {
      const saved = { ...draft, title, items: draft.items.map((item) => ({ ...item, name: normalizeCustomEmojiName(item.name) })) };
      await nostrActions.saveMediaPack(saved);
      await onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save pack.');
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

  return { draft, setDraft, newItemKind, setNewItemKind, busy, error, addFiles, save, updateItem, removeItem, addUrlItem };
}
