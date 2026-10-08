'use client';

import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import type { SelectedMedia } from '@/types/media/library';
import MediaItemMenu from './MediaItemMenu';

/** The selected item's menu wired to the library. */
export default function LibraryItemMenu({ vm, selection }: { vm: MediaLibraryModel; selection: SelectedMedia }) {
  return (
    <MediaItemMenu
      selection={selection}
      favorite={vm.isFavoriteItem(selection.item)}
      busy={vm.busy}
      server={vm.isServer}
      onClose={vm.closeItemMenu}
      onViewPack={vm.viewSelectedPack}
      onFavorite={vm.favoriteSelected}
      onCreatePack={vm.createPackFromSelected}
    />
  );
}
