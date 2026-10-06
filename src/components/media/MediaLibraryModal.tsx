'use client';

import { useRef } from 'react';
import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Chip from '@/components/ui/Chip';
import CloseButton from '@/components/ui/CloseButton';
import EmptyState from '@/components/ui/EmptyState';
import FileInput from '@/components/ui/FileInput';
import Input from '@/components/ui/Input';
import MediaLibraryShell from './library/MediaLibraryShell';
import LibraryTabs from './library/LibraryTabs';
import PackCard from './library/PackCard';
import PackViewer from './library/PackViewer';
import MediaItemMenu from './library/MediaItemMenu';
import MediaItemGrid from './library/MediaItemGrid';
import PackEditor from './library/PackEditor';
import { newPack } from './library/pack-utils';
import { useMediaLibrary, type LibraryServer } from '@/hooks/media/library/useMediaLibrary';
import type { LibraryTab, MediaFilter, SelectedMedia } from './library/types';

/**
 * Media packs: browse the marketplace, your own packs and favourites, or
 * (with `server`) pick the packs a relay offers. Opened with
 * `initialSelection`, it is just the item menu for that one item.
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
  const { t } = useTranslation();
  const uploadRef = useRef<HTMLInputElement>(null);
  const launchedFromItem = !!initialSelection;
  const {
    myPubkey, packsByAddress, favorites, packs, visiblePacks,
    tab, setTab, kindFilter, setKindFilter, query, setQuery,
    editing, setEditing, viewingPack, setViewingPack, selectedMedia, setSelectedMedia,
    busy, message, uploadFavorite, togglePack, toggleItem, deletePack, toggleServerPack,
  } = useMediaLibrary({ server, initialTab, initialKind, initialSelection });

  if (launchedFromItem && selectedMedia) {
    return <MediaItemMenu
      selection={selectedMedia}
      favorite={favorites.items.some((item) => item.url === selectedMedia.item.url)}
      busy={busy}
      server={!!server}
      onClose={onClose}
      onViewPack={() => {
        if (selectedMedia.pack) setViewingPack(selectedMedia.pack);
        setSelectedMedia(null);
      }}
      onFavorite={() => {
        toggleItem(selectedMedia.item);
        onClose();
      }}
      onCreatePack={() => {
        const draft = newPack();
        setEditing({ ...draft, title: selectedMedia.item.name + " pack", items: [selectedMedia.item] });
        setSelectedMedia(null);
      }}
    />;
  }

  if (launchedFromItem && viewingPack) {
    return <PackViewer
      pack={viewingPack}
      favorite={favorites.packAddresses.includes(viewingPack.address)}
      itemFavorites={favorites.items}
      busy={busy}
      server={!!server}
      serverSelected={server?.emojiSet.packAddresses?.includes(viewingPack.address) ?? false}
      closeOnEscape
      onClose={onClose}
      onOpenItem={(item) => setSelectedMedia({ pack: viewingPack, item })}
      onFavorite={() => togglePack(viewingPack)}
      onServer={() => void toggleServerPack(viewingPack).catch(() => {})}
    />;
  }

  return (
    <MediaLibraryShell
      embedded={embedded}
      onClose={onClose}
      closeOnEscape={!editing && !viewingPack && !selectedMedia}
    >
      {!server && <FileInput ref={uploadRef} accept="image/png,image/jpeg,image/webp,image/gif" aria-label={t('media.upload')} onChange={(event) => { void uploadFavorite(event.target.files?.[0]); event.target.value = ""; }} />}
      <aside className="hidden w-52 shrink-0 flex-col border-r border-lc-border bg-lc-black/40 p-3 sm:flex">
        <div className="px-2 pb-4 pt-2">
          <div className="text-base font-bold text-lc-white">{t('media.title')}</div>
          <div className="mt-1 text-xs text-lc-muted">{t('media.subtitle')}</div>
        </div>
        <LibraryTabs tab={tab} setTab={setTab} server={!!server} />
        {!server && <div className="mt-auto grid gap-2">
          <Button variant="outline" tone="accent" size="sm" disabled={busy} onClick={() => uploadRef.current?.click()}>{t('media.upload')}</Button>
          <Button size="lg" onClick={() => setEditing(newPack())}>{t('media.createPack')}</Button>
        </div>}
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center gap-3 border-b border-lc-border p-4">
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-lc-white sm:hidden">{t('media.title')}</div>
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('media.searchPlaceholder')}
              aria-label={t('media.searchPlaceholder')}
              className="mt-2 sm:mt-0"
            />
          </div>
          <CloseButton onClick={onClose} label={t('media.close')} />
        </header>

        <div className="shrink-0 overflow-x-auto border-b border-lc-border p-2 sm:hidden">
          <div className="flex min-w-max gap-1"><LibraryTabs tab={tab} setTab={setTab} server={!!server} mobile /></div>
        </div>

        {!server && <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-lc-border p-2 sm:hidden">
          <Button variant="outline" tone="accent" size="sm" disabled={busy} onClick={() => uploadRef.current?.click()}>{t('media.upload')}</Button>
          <Button size="lg" onClick={() => setEditing(newPack())}>{t('media.createPack')}</Button>
        </div>}

        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-lc-border px-4 py-2" role="group" aria-label={t('media.filterByType')}>
          {([['all', 'All'], ['emoji', 'Emoji'], ['gif', 'GIFs'], ['sticker', 'Stickers']] as Array<[MediaFilter, string]>).map(([value, label]) => (
            <Chip key={value} onClick={() => setKindFilter(value)} state={kindFilter === value ? 'selected' : 'idle'}>
              {label}
            </Chip>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "server" && server && (
            <Card as="section" surface="translucent" padding="lg" data-testid="server-pack-summary" className="mb-5">
              <h2 className="font-semibold text-lc-white">{t('media.serverPacks')}</h2>
              <p className="mt-1 text-xs text-lc-muted">{(server.emojiSet.packAddresses ?? []).length} packs selected. Add or remove existing packs below.</p>
              <p className="mt-2 text-xs text-lc-muted">{t('media.serverPacksHelp')}</p>
              {server.emojiSet.emojis.length > 0 && <p className="mt-2 text-xs text-amber-300">{t('media.legacyHelp')}</p>}
            </Card>
          )}

          {tab === "favorites" && favorites.items.length > 0 && (
            <section className="mb-5">
              <h2 className="mb-2 text-sm font-semibold text-lc-white">{t('media.individualFavorites')}</h2>
              <MediaItemGrid
                items={favorites.items.filter((item) => kindFilter === "all" || item.kind === kindFilter)}
                favorites={favorites.items}
                onOpen={(item) => {
                  const source = item.packAddress ? packsByAddress[item.packAddress] : packs.find((pack) => pack.items.some((value) => value.url === item.url));
                  setSelectedMedia({ ...(source ? { pack: source } : {}), item });
                }}
                onFavorite={toggleItem}
              />
            </section>
          )}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visiblePacks.map((pack) => (
              <PackCard
                key={pack.address}
                pack={pack}
                mine={pack.author === myPubkey}
                favorite={favorites.packAddresses.includes(pack.address)}
                itemFavorites={favorites.items}
                busy={busy}
                server={!!server}
                serverSelected={server?.emojiSet.packAddresses?.includes(pack.address) ?? false}
                onView={() => setViewingPack(pack)}
                onOpenItem={(item) => setSelectedMedia({ pack, item })}
                onEdit={() => setEditing(pack)}
                onDelete={() => void deletePack(pack)}
                onFavorite={() => togglePack(pack)}
                onServer={() => void toggleServerPack(pack).catch(() => {})}
              />
            ))}
          </div>
          {visiblePacks.length === 0 && (
            <EmptyState padding="none" className="py-16">
              {tab === 'mine' ? 'Create your first reusable media pack.' : tab === 'favorites' ? 'Favorite a pack or individual item to keep it across servers.' : 'No packs found.'}
            </EmptyState>
          )}
        </div>
        {message && <div className="shrink-0 border-t border-lc-border px-4 py-2 text-xs text-lc-green">{message}</div>}
      </main>

      {editing && !server && <PackEditor
        pack={editing}
        initialKind={kindFilter === "all" ? "sticker" : kindFilter}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          setTab("mine");
        }}
      />}
      {viewingPack && <PackViewer
        pack={viewingPack}
        favorite={favorites.packAddresses.includes(viewingPack.address)}
        itemFavorites={favorites.items}
        busy={busy}
        server={!!server}
        serverSelected={server?.emojiSet.packAddresses?.includes(viewingPack.address) ?? false}
        closeOnEscape={!selectedMedia}
        onClose={launchedFromItem ? onClose : () => setViewingPack(null)}
        onOpenItem={(item) => setSelectedMedia({ pack: viewingPack, item })}
        onFavorite={() => togglePack(viewingPack)}
        onServer={() => void toggleServerPack(viewingPack).catch(() => {})}
      />}
      {selectedMedia && <MediaItemMenu
        selection={selectedMedia}
        favorite={favorites.items.some((item) => item.url === selectedMedia.item.url)}
        busy={busy}
        server={!!server}
        onClose={launchedFromItem ? onClose : () => setSelectedMedia(null)}
        onViewPack={() => {
          if (selectedMedia.pack) setViewingPack(selectedMedia.pack);
          setSelectedMedia(null);
        }}
        onFavorite={() => {
          toggleItem(selectedMedia.item);
          if (launchedFromItem) onClose();
          else setSelectedMedia(null);
        }}
        onCreatePack={() => {
          const draft = newPack();
          setEditing({ ...draft, title: selectedMedia.item.name + " pack", items: [selectedMedia.item] });
          setSelectedMedia(null);
        }}
      />}
    </MediaLibraryShell>
  );
}
