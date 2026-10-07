'use client';

import { useTranslations } from 'next-intl';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import MediaItemGrid from './MediaItemGrid';
import Heading from '@/components/ui/layout/Heading';

/** The individually saved items, above the saved packs in the favourites tab. */
export default function FavoriteItemsSection({ vm }: { vm: MediaLibraryModel }) {
  const t = useTranslations();
  return (
    <section className="mb-5">
      <Heading as="h3" variant="panel" className="mb-2">{t('media.individualFavorites')}</Heading>
      <MediaItemGrid
        items={vm.favoriteItemsShown}
        favorites={vm.favorites.items}
        onOpen={vm.openFavorite}
        onFavorite={vm.toggleItem}
      />
    </section>
  );
}
