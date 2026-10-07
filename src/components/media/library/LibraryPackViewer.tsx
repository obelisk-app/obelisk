'use client';

import type { JsMediaPack } from '@/services/nostr-bridge';
import type { MediaLibraryModel } from '@/hooks/media/library/useMediaLibraryModal';
import PackViewer from './PackViewer';

/** The pack viewer wired to the library: open an item, save the pack, offer it on the relay. */
export default function LibraryPackViewer({ vm, pack, closeOnEscape }: {
  vm: MediaLibraryModel;
  pack: JsMediaPack;
  closeOnEscape: boolean;
}) {
  return (
    <PackViewer
      pack={pack}
      favorite={vm.isFavoritePack(pack)}
      itemFavorites={vm.favorites.items}
      busy={vm.busy}
      server={vm.isServer}
      serverSelected={vm.isServerPack(pack)}
      closeOnEscape={closeOnEscape}
      onClose={vm.closeViewer}
      onOpenItem={(item) => vm.openItem(pack, item)}
      onFavorite={() => vm.togglePack(pack)}
      onServer={() => vm.toggleServer(pack)}
    />
  );
}
