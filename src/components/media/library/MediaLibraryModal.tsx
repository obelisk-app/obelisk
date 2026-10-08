'use client';

import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';
import Input from '@/components/ui/forms/Input';
import ModalHeader from '@/components/ui/overlays/ModalHeader';
import MediaLibraryShell from './MediaLibraryShell';
import LibraryTabs from './LibraryTabs';
import LibraryActions from './LibraryActions';
import MediaKindFilter from './MediaKindFilter';
import ServerPackSummary from './ServerPackSummary';
import FavoriteItemsSection from './FavoriteItemsSection';
import PackGrid from './PackGrid';
import MediaLibraryOverlays from './MediaLibraryOverlays';
import LibraryPackViewer from './LibraryPackViewer';
import LibraryItemMenu from './LibraryItemMenu';
import { useMediaLibraryModal } from '@/hooks/media/library/useMediaLibraryModal';
import type { LibraryServer } from '@/hooks/media/library/useMediaLibrary';
import type { LibraryTab, MediaFilter, SelectedMedia } from '@/types/media/library';

/**
 * Media packs: browse the marketplace, your own packs and favourites, or
 * (with `server`) pick the packs a relay offers. Opened with
 * `initialSelection`, it is just the item menu for that one item. State and
 * actions come from `useMediaLibraryModal`.
 */
export default function MediaLibraryModal({
  onClose,
  embedded = false,
  server,
  initialTab = server ? 'server' : 'discover',
  initialKind = 'all',
  initialSelection,
}: {
  onClose: () => void;
  embedded?: boolean;
  server?: LibraryServer;
  initialTab?: LibraryTab;
  initialKind?: MediaFilter;
  initialSelection?: SelectedMedia;
}) {
  const t = useTranslations();
  const vm = useMediaLibraryModal({ onClose, server, initialTab, initialKind, initialSelection });
  const uploadRef = useRef<HTMLInputElement>(null);

  if (vm.mode === 'item' && vm.selectedMedia) return <LibraryItemMenu vm={vm} selection={vm.selectedMedia} />;
  if (vm.mode === 'pack' && vm.viewingPack) return <LibraryPackViewer vm={vm} pack={vm.viewingPack} closeOnEscape />;

  return (
    <MediaLibraryShell embedded={embedded} onClose={onClose} closeOnEscape={vm.closeOnEscape}>
      {!vm.isServer && <FileInput ref={uploadRef} accept="image/png,image/jpeg,image/webp,image/gif" aria-label={t('media.upload')} onChange={(event) => vm.uploadPicked(event.target)} />}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-lc-border bg-lc-black/40 p-3 sm:flex">
        <LibraryTabs tab={vm.tab} setTab={vm.setTab} server={vm.isServer} />
        {!vm.isServer && <LibraryActions busy={vm.busy} onUpload={() => uploadRef.current?.click()} onCreate={vm.createPack} className="mt-auto grid gap-2" />}
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ModalHeader title={t('media.title')} subtitle={t('media.subtitle')} onClose={onClose} closeLabel={t('media.close')}>
          <Input
            type="search"
            value={vm.query}
            onChange={(event) => vm.setQuery(event.target.value)}
            placeholder={t('media.searchPlaceholder')}
            aria-label={t('media.searchPlaceholder')}
            className="w-36 sm:w-72"
          />
        </ModalHeader>

        <div className="shrink-0 overflow-x-auto border-b border-lc-border p-2 sm:hidden">
          <div className="flex min-w-max gap-1"><LibraryTabs tab={vm.tab} setTab={vm.setTab} server={vm.isServer} mobile /></div>
        </div>

        {!vm.isServer && <LibraryActions busy={vm.busy} onUpload={() => uploadRef.current?.click()} onCreate={vm.createPack} className="grid shrink-0 grid-cols-2 gap-2 border-b border-lc-border p-2 sm:hidden" />}

        <MediaKindFilter value={vm.kindFilter} onChange={vm.setKindFilter} />

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {vm.tab === 'server' && vm.isServer && <ServerPackSummary count={vm.serverPackCount} legacyItems={vm.hasLegacyServerItems} />}
          {vm.tab === 'favorites' && vm.favorites.items.length > 0 && <FavoriteItemsSection vm={vm} />}
          <PackGrid vm={vm} />
        </div>
        {vm.message && <div className="shrink-0 border-t border-lc-border px-4 py-2 text-xs text-lc-green">{vm.message}</div>}
      </main>

      <MediaLibraryOverlays vm={vm} />
    </MediaLibraryShell>
  );
}
