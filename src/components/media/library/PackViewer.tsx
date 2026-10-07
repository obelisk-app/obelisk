'use client';

import type { JsMediaItem, JsMediaPack } from '@/services/nostr-bridge';
import Modal from '@/components/ui/overlays/Modal';
import Chip from '@/components/ui/data/Chip';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import ModalFooter from '@/components/ui/overlays/ModalFooter';
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
    <Modal onClose={onClose} closeOnEscape={closeOnEscape} testId="media-pack-viewer" panelClassName="mx-3 flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-lc-border bg-lc-dark shadow-xl">
      <ModalHeader
        title={pack.title}
        subtitle={<>{pack.description ? pack.description + ' · ' : ''}{t('media.itemCount', { count: pack.items.length })}</>}
        onClose={onClose}
        closeLabel={t('media.closeViewer')}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <MediaItemGrid items={pack.items} favorites={server ? [] : itemFavorites} onOpen={onOpenItem} />
      </div>
      <ModalFooter actions={server ? [{ label: serverLabel, onClick: onServer, disabled: busy, tone: serverSelected ? 'danger' : 'primary' }] : []}>
        {!server && <Chip size="touch" state={favorite ? 'selected' : 'idle'} disabled={busy} onClick={onFavorite} aria-label={favorite ? t('media.pack.unsaveNamed', { title: pack.title }) : t('media.pack.saveNamed', { title: pack.title })}>{favorite ? '★' : '☆'} {t(favorite ? 'media.pack.saved' : 'media.pack.save')}</Chip>}
      </ModalFooter>
    </Modal>
  );
}
