'use client';

import type { JsMediaItem } from '@/services/nostr-bridge';
import MediaThumb from '@/components/media/library/MediaThumb';
import { CloseIcon } from '@/components/ui/icons/icons';
import { useTranslations } from 'next-intl';

/** A square grid of media items; each tile opens, favourites, or just shows its item. */
export default function MediaItemGrid({ items, favorites = [], busy = false, onOpen, onFavorite, onRemove }: {
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
      {items.map((item) => {
        const favorite = favorites.some((value) => value.url === item.url);
        return <div key={item.url} className="relative">
          {onOpen ? (
            <button type="button" onClick={() => onOpen(item)} title={t('media.item.open', { name: item.name })} aria-label={t('media.item.open', { name: item.name })} className="relative flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2 hover:border-lc-green/50">
              <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
              {favorite && !onFavorite && <span className="absolute right-1 top-1 text-xs text-lc-green">★</span>}
            </button>
          ) : onFavorite ? (
            <button type="button" onClick={() => onFavorite(item)} title={t(favorite ? 'media.item.unfavorite' : 'media.item.favorite', { name: item.name })} className="relative flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2 hover:border-lc-green/50">
              <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
              <span className={"absolute right-1 top-1 text-xs " + (favorite ? "text-lc-green" : "text-white/50")}>★</span>
            </button>
          ) : (
            <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2">
              <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {onOpen && onFavorite && <button type="button" disabled={busy} onClick={() => onFavorite(item)} aria-label={t(favorite ? 'media.item.removeFavorite' : 'media.item.addFavorite', { name: item.name })} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-lc-green bg-lc-black/85 text-xs text-lc-green">{favorite ? "★" : "☆"}</button>}
          {onRemove && <button type="button" disabled={busy} onClick={() => onRemove(item)} aria-label={t('media.item.removeFromServer', { name: item.name })} className="absolute left-1 top-1 rounded bg-lc-black/80 px-1 py-0.5 text-xs text-red-300"><CloseIcon size={12} /></button>}
        </div>;
      })}
    </div>
  );
}
