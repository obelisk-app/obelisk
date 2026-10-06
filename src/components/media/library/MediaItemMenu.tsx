'use client';

import MediaThumb from '@/components/media/MediaThumb';
import Button from '@/components/ui/Button';
import CloseButton from '@/components/ui/CloseButton';
import Modal from '@/components/ui/Modal';
import { useTranslations } from 'next-intl';
import type { SelectedMedia } from '@/utils/media-library/types';

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
    <Modal onClose={onClose} testId="media-item-menu" panelClassName="lc-card mx-3 w-full max-w-sm overflow-hidden bg-lc-dark">
      <header className="flex items-center justify-between border-b border-lc-border p-4">
        <div>
          <h2 className="font-semibold text-lc-white">:{item.name}:</h2>
          <p className="mt-1 text-xs text-lc-muted">{pack ? t('media.item.fromPack', { kind: t(`media.kind.${item.kind}`), title: pack.title }) : t('media.item.individual', { kind: t(`media.kind.${item.kind}`) })}</p>
        </div>
        <CloseButton onClick={onClose} label={t('media.closeActions')} />
      </header>
      <div className="flex h-64 items-center justify-center bg-lc-black p-6">
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
