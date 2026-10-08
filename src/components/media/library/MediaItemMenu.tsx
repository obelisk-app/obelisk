'use client';

import MediaThumb from '@/components/media/library/MediaThumb';
import Button from '@/components/ui/buttons/Button';
import Modal from '@/components/ui/overlays/Modal';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import { useTranslations } from 'next-intl';
import type { SelectedMedia } from '@/types/media/library';

/** What can be done with one item: view its pack, start a pack with it, favourite it. */
export default function MediaItemMenu({ selection, favorite, busy, server, onClose, onViewPack, onFavorite, onCreatePack }: {
  selection: SelectedMedia;
  favorite: boolean;
  busy: boolean;
  server: boolean;
  onClose: () => void;
  onViewPack: () => void;
  onFavorite: () => void;
  onCreatePack?: () => void;
}) {
  const t = useTranslations();
  const { item, pack } = selection;
  return (
    <Modal onClose={onClose} testId="media-item-menu" panelClassName="mx-3 flex w-full max-w-sm flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl">
      <ModalHeader
        title={<>:{item.name}:</>}
        subtitle={pack ? t('media.item.fromPack', { kind: t(`media.kind.${item.kind}`), title: pack.title }) : t('media.item.individual', { kind: t(`media.kind.${item.kind}`) })}
        onClose={onClose}
        closeLabel={t('media.closeActions')}
      />
      <div className="flex h-64 shrink-0 items-center justify-center bg-lc-black p-6">
        <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="grid gap-2 p-4">
        {pack && <Button variant="secondary" size="lg" onClick={onViewPack}>{t('media.item.viewPack', { title: pack.title })}</Button>}
        {!server && onCreatePack && <Button variant="outline" tone="accent" size="sm" onClick={onCreatePack}>{t('media.createPackWithItem')}</Button>}
        {!server && <Button size="lg" disabled={busy} onClick={onFavorite}>{t(favorite ? 'media.item.removeFromFavorites' : 'media.item.addToFavorites')}</Button>}
      </div>
    </Modal>
  );
}
