'use client';

import { useTranslations } from 'next-intl';
import Checkbox from '@/components/ui/forms/Checkbox';
import type { JsMediaItem } from '@/services/nostr-bridge';
import { isFavoriteItem } from '@/utils/media/library/library-view';
import MediaItemTile from './MediaItemTile';

/** A square grid of media items; each tile opens, favourites, or just shows its item. */
export default function MediaItemGrid({ items, favorites = [], busy = false, onOpen, onFavorite, onRemove, selected, onSelect }: {
  selected?: readonly string[];
  onSelect?: (item: JsMediaItem) => void;
  items: readonly JsMediaItem[];
  favorites?: readonly JsMediaItem[];
  busy?: boolean;
  onOpen?: (item: JsMediaItem) => void;
  onFavorite?: (item: JsMediaItem) => void;
  onRemove?: (item: JsMediaItem) => void;
}) {
  const t = useTranslations();
  return (
    <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {items.map((item) => (
        <div key={`${item.url}-${item.name}`}>
          {onSelect && <Checkbox checked={selected?.includes(item.url) ?? false} onChange={() => onSelect(item)} aria-label={t('media.manage.selectItem', { name: item.name })} />}
        <MediaItemTile
          item={item}
          favorite={isFavoriteItem(favorites, item)}
          busy={busy}
          onOpen={onOpen}
          onFavorite={onFavorite}
          onRemove={onRemove}
        />
        </div>
      ))}
    </div>
  );
}
