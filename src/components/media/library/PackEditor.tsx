'use client';

import { useRef } from 'react';
import type { JsMediaKind } from '@/services/nostr-bridge';
import MediaThumb from '@/components/media/library/MediaThumb';
import Button from '@/components/ui/buttons/Button';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
import EmptyState from '@/components/ui/feedback/EmptyState';
import FileInput from '@/components/ui/forms/FileInput';
import Input from '@/components/ui/forms/Input';
import Select from '@/components/ui/forms/Select';
import { useTranslations } from 'next-intl';
import { usePackEditor } from '@/hooks/media/library/usePackEditor';
import type { EditablePack } from '@/utils/media/library/types';
import PackKindOptions from './PackKindOptions';

/** Create or edit a pack: name, description, and one row per item. */
export default function PackEditor({ pack, initialKind, onClose, onSaved }: {
  pack: EditablePack;
  initialKind: JsMediaKind;
  onClose: () => void;
  onSaved: (pack: EditablePack) => Promise<void>;
}) {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    draft, setDraft, newItemKind, setNewItemKind, busy, error,
    filesPicked, save, updateItem, removeItem, addUrlItem,
  } = usePackEditor(pack, initialKind, onSaved);

  return (
    <Modal onClose={onClose} testId="media-pack-editor" panelClassName="mx-3 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl">
      <ModalHeader title={t('media.editPack')} onClose={onClose} closeLabel={t('media.closeEditor')} />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('media.packName')} aria-label={t('media.packName')} />
          <Input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('mobile.field.description')} aria-label={t('media.packDescription')} />
        </div>
        <div className="my-4 flex flex-wrap items-end gap-2">
          <FileInput ref={inputRef} multiple accept="image/*" aria-label={t('media.upload')} onChange={(event) => filesPicked(event.target)} />
          <Select
            size="md"
            value={newItemKind}
            onChange={(event) => setNewItemKind(event.target.value as JsMediaKind)}
            label={t('media.newItemsAre')}
            aria-label={t('media.newItemType')}
          >
            <PackKindOptions />
          </Select>
          <Button variant="outline" tone="accent" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>{t('media.upload')}</Button>
          <Button variant="secondary" size="lg" onClick={addUrlItem}>{t('media.addUrl')}</Button>
        </div>
        <div className="space-y-2">
          {draft.items.map((item, index) => (
            <div key={`${index}-${item.url}`} className="grid items-center gap-2 rounded-lg border border-lc-border p-2 sm:grid-cols-[3rem_10rem_7rem_minmax(0,1fr)_auto]">
              <div className="flex h-12 w-12 items-center justify-center rounded bg-lc-black p-1">{item.url && <MediaThumb src={item.url} alt="" className="max-h-full max-w-full object-contain" />}</div>
              <Input value={item.name} onChange={(event) => updateItem(index, { name: event.target.value })} placeholder={t('media.pack.shortcodePlaceholder')} aria-label={t('media.itemShortcode', { n: String(index + 1) })} />
              <Select size="md" className="w-full" value={item.kind} onChange={(event) => updateItem(index, { kind: event.target.value as JsMediaKind })} aria-label={t('media.itemType', { n: String(index + 1) })}>
                <PackKindOptions />
              </Select>
              <Input value={item.url} onChange={(event) => updateItem(index, { url: event.target.value })} placeholder="https://…" aria-label={t('media.itemUrl', { n: String(index + 1) })} />
              <Button variant="ghost" tone="danger" size="xs" onClick={() => removeItem(index)}>{t('media.remove')}</Button>
            </div>
          ))}
          {draft.items.length === 0 && <EmptyState>{t('media.uploadHelp')}</EmptyState>}
        </div>
      </div>
      {error && <div className="border-t border-lc-border px-4 py-2 text-xs text-red-300" role="alert">{error}</div>}
      <ModalFooter
        cancel={{ onClick: onClose }}
        actions={[{ label: t(busy ? 'media.pack.saving' : 'media.pack.save'), onClick: () => void save(), disabled: busy, tone: 'primary' }]}
      />
    </Modal>
  );
}
