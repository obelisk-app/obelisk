'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { uploadToBlossom } from '@/services/media/blossom';
import { nostrActions } from '@/services/nostr-bridge';
import type { JsMediaItem, JsMediaKind } from '@/services/nostr-bridge';
import { mergePackItems, uniqueName } from '@/utils/media/library/pack-utils';
import type { EditablePack } from '@/types/media/library';
import { useForm } from '@/hooks/common/useForm';
import { libraryPackForm } from '@/services/media/library-pack-form';
import { takePickedFiles } from '@/utils/media/upload/picked-file';

/** The editable draft and upload lifecycle; useForm owns validation and submission. */
export function usePackEditor(
  pack: EditablePack,
  initialKind: JsMediaKind,
  onSaved: (pack: EditablePack) => Promise<void>,
  publish: (pack: EditablePack) => Promise<void> = nostrActions.saveMediaPack,
) {
  const t = useTranslations();
  const form = useForm(libraryPackForm(pack, publish, onSaved));
  const draft = form.values;
  const setDraft = form.setValues;
  const [newItemKind, setNewItemKind] = useState<JsMediaKind>(initialKind);
  const [uploading, setUploading] = useState(false);
  const uploadLock = useRef(false);
  const [failedFiles, setFailedFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<readonly number[]>([]);
  const busy = uploading || form.submitting;

  const addFiles = async (files: ArrayLike<File> | null) => {
    if (uploadLock.current || form.submitting) return;
    const images = Array.from(files ?? []).filter((file) => file.type.startsWith('image/'));
    if (!images.length) return;
    uploadLock.current = true;
    setUploading(true);
    form.setError(null);
    const items = [...draft.items];
    const used = new Set(items.map((item) => item.name));
    const failed: File[] = [];
    for (const file of images) {
      try {
        const url = await uploadToBlossom(file);
        const item = { name: uniqueName(file.name, used), url, kind: newItemKind };
        items.splice(0, items.length, ...mergePackItems(items, [item]));
        form.set('items', [...items]);
      } catch {
        failed.push(file);
      }
    }
    setFailedFiles(failed);
    if (failed.length) form.setError(t('media.error.uploadFailed'));
    uploadLock.current = false;
    setUploading(false);
  };
  const updateItem = (index: number, patch: Partial<JsMediaItem>) => {
    form.set('items', draft.items.map((value, itemIndex) => itemIndex === index ? { ...value, ...patch } : value));
  };
  const removeItem = (index: number) => {
    form.set('items', draft.items.filter((_, itemIndex) => itemIndex !== index));
    setSelected([]);
  };
  const addUrlItem = () => form.set('items', [...draft.items, { name: '', url: '', kind: newItemKind }]);
  const filesPicked = (input: HTMLInputElement) => { void addFiles(takePickedFiles(input)); };
  const toggleSelected = (index: number) => setSelected((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index]);
  const removeSelected = () => {
    form.set('items', draft.items.filter((_, index) => !selected.includes(index)));
    setSelected([]);
  };
  return { form, draft, setDraft, newItemKind, setNewItemKind, busy, error: form.error,
    addFiles, filesPicked, save: form.submit, updateItem, removeItem, addUrlItem,
    failedFiles, retryFiles: () => void addFiles(failedFiles), selected, toggleSelected, removeSelected };
}
