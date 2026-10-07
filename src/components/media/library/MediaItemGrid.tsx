'use client';

import type { JsMediaItem } from '@/services/nostr-bridge';
import { isFavoriteItem } from '@/utils/media/library/library-view';
import MediaItemTile from './MediaItemTile';

/** A square grid of media items; each tile opens, favourites, or just shows its item. */
export default function MediaItemGrid({ items, favorites = [], busy = false, onOpen, onFavorite, onRemove }: {
  items: readonly JsMediaItem[];
  favorites?: readonly JsMediaItem[];
  busy?: boolean;
  onOpen?: (item: JsMediaItem) => void;
  onFavorite?: (item: JsMediaItem) => void;
  onRemove?: (item: JsMediaItem) => void;
}) {
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {items.map((item) => (
        <MediaItemTile
          key={item.url}
          item={item}
          favorite={isFavoriteItem(favorites, item)}
          busy={busy}
          onOpen={onOpen}
          onFavorite={onFavorite}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
