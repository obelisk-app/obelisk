'use client';

import { useTranslations } from 'next-intl';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import Button from '@/components/ui/buttons/Button';
import { useMediaSelection } from '@/hooks/media/library/useMediaSelection';
import MediaItemGrid from './MediaItemGrid';
import Heading from '@/components/ui/layout/Heading';

/** The individually saved items, above the saved packs in the favourites tab. */
export default function FavoriteItemsSection({ vm }: { vm: MediaLibraryModel }) {
  const t = useTranslations();
  const selection = useMediaSelection(vm.favoriteItemsShown);
  return (
    <section className="mb-5">
      <Heading as="h3" variant="panel" className="mb-2">{t('media.individualFavorites')}</Heading>
      <MediaItemGrid
        items={vm.favoriteItemsShown}
        selected={selection.urls}
        onSelect={selection.toggle}
        favorites={vm.favorites.items}
        onOpen={vm.openFavorite}
        onFavorite={vm.toggleItem}
      />
      <Button disabled={!selection.selected.length} onClick={() => vm.copyItems(selection.selected)}>{t('media.manage.copySelected', { count: selection.selected.length })}</Button>
    </section>
  );
}
