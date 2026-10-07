'use client';

import { useTranslations } from 'next-intl';
import EmptyState from '@/components/ui/feedback/EmptyState';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import PackCard from './PackCard';

/** The packs the tab, filter and search leave, or the tab's empty copy. */
export default function PackGrid({ vm }: { vm: MediaLibraryModel }) {
  const t = useTranslations();
  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {vm.visiblePacks.map((pack) => (
          <PackCard
            key={pack.address}
            pack={pack}
            mine={pack.author === vm.myPubkey}
            favorite={vm.isFavoritePack(pack)}
            itemFavorites={vm.favorites.items}
            busy={vm.busy}
            server={vm.isServer}
            serverSelected={vm.isServerPack(pack)}
            onView={() => vm.setViewingPack(pack)}
            onOpenItem={(item) => vm.openItem(pack, item)}
            onEdit={() => vm.setEditing(pack)}
            onDelete={() => vm.removePack(pack)}
            onFavorite={() => vm.togglePack(pack)}
            onServer={() => vm.toggleServer(pack)}
          />
        ))}
      </div>
      {vm.visiblePacks.length === 0 && (
        <EmptyState padding="none" className="py-16">{t(vm.emptyKey)}</EmptyState>
      )}
    </>
  );
}
