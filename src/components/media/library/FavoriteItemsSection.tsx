'use client';

import { useTranslations } from 'next-intl';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import MediaItemGrid from './MediaItemGrid';

/** The individually saved items, above the saved packs in the favourites tab. */
export default function FavoriteItemsSection({ vm }: { vm: MediaLibraryModel }) {
  const t = useTranslations();
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-semibold text-lc-white">{t('media.individualFavorites')}</h3>
      <MediaItemGrid
        items={vm.favoriteItemsShown}
        favorites={vm.favorites.items}
        onOpen={vm.openFavorite}
        onFavorite={vm.toggleItem}
      />
    </section>
  );
}
