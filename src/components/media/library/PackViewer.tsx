'use client';

import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import CloseButton from '@/components/ui/CloseButton';
import { useTranslations } from 'next-intl';
import MediaItemGrid from './MediaItemGrid';

/** Every item in one pack, with save (or add-to-server) in the footer. */
export default function PackViewer({ pack, favorite, itemFavorites, busy, server, serverSelected, closeOnEscape, onClose, onOpenItem, onFavorite, onServer }: {
  pack: JsMediaPack;
  favorite: boolean;
  itemFavorites: readonly JsMediaItem[];
  busy: boolean;
  server: boolean;
  serverSelected: boolean;
  closeOnEscape: boolean;
  onClose: () => void;
  onOpenItem: (item: JsMediaItem) => void;
  onFavorite: () => void;
  onServer: () => void;
}) {
  const t = useTranslations();
  const serverLabel = t(serverSelected ? 'media.pack.removeFromServer' : 'media.pack.addToServer');
  return (
    <Modal onClose={onClose} closeOnEscape={closeOnEscape} testId="media-pack-viewer" panelClassName="lc-card mx-3 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden bg-lc-dark">
      <header className="flex items-start justify-between gap-4 border-b border-lc-border p-4">
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-lc-white">{pack.title}</h2>
          <p className="mt-1 text-xs text-lc-muted">{pack.description ? pack.description + ' · ' : ''}{t('media.itemCount', { count: pack.items.length })}</p>
        </div>
        <CloseButton onClick={onClose} label={t('media.closeViewer')} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <MediaItemGrid items={pack.items} favorites={server ? [] : itemFavorites} onOpen={onOpenItem} />
      </div>
      <footer className="flex justify-end border-t border-lc-border p-4">
        {server
          ? (serverSelected
            ? <Button variant="outline" tone="danger" size="sm" disabled={busy} onClick={onServer}>{serverLabel}</Button>
            : <Button size="lg" disabled={busy} onClick={onServer}>{serverLabel}</Button>)
          : <Chip size="touch" state={favorite ? 'selected' : 'idle'} disabled={busy} onClick={onFavorite} aria-label={favorite ? t('media.pack.unsaveNamed', { title: pack.title }) : t('media.pack.saveNamed', { title: pack.title })}>{favorite ? '★' : '☆'} {t(favorite ? 'media.pack.saved' : 'media.pack.save')}</Chip>}
      </footer>
    </Modal>
  );
}
