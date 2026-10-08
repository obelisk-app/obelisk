'use client';

import Button from '@/components/ui/buttons/Button';
import type { JsMediaItem } from '@/services/nostr-bridge';
import MediaThumb from '@/components/media/library/MediaThumb';
import { CloseIcon } from '@/assets/icons';
import { useTranslations } from 'next-intl';

/** One tile of a MediaItemGrid: opens the item, toggles its favourite, or only shows it, with the optional star and remove badges. */
export default function MediaItemTile({ item, favorite, busy, onOpen, onFavorite, onRemove }: {
  item: JsMediaItem;
  favorite: boolean;
  busy: boolean;
  onOpen?: (item: JsMediaItem) => void;
  onFavorite?: (item: JsMediaItem) => void;
  onRemove?: (item: JsMediaItem) => void;
}) {
  const t = useTranslations();
  return <div className="relative">
    {onOpen ? (
      <Button variant="bare" type="button" onClick={() => onOpen(item)} title={t('media.item.open', { name: item.name })} aria-label={t('media.item.open', { name: item.name })} className="relative flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2 hover:border-lc-green/50">
        <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
        {favorite && !onFavorite && <span className="absolute right-1 top-1 text-xs text-lc-green">★</span>}
      </Button>
    ) : onFavorite ? (
      <Button variant="bare" type="button" onClick={() => onFavorite(item)} title={t(favorite ? 'media.item.unfavorite' : 'media.item.favorite', { name: item.name })} className="relative flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2 hover:border-lc-green/50">
        <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
        <span className={"absolute right-1 top-1 text-xs " + (favorite ? "text-lc-green" : "text-white/50")}>★</span>
      </Button>
    ) : (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-lc-border bg-lc-dark p-2">
        <MediaThumb src={item.url} alt={":" + item.name + ":"} className="max-h-full max-w-full object-contain" />
      </div>
    )}
    {onOpen && onFavorite && <Button variant="bare" type="button" disabled={busy} onClick={() => onFavorite(item)} aria-label={t(favorite ? 'media.item.removeFavorite' : 'media.item.addFavorite', { name: item.name })} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border border-lc-green bg-lc-black/85 text-xs text-lc-green">{favorite ? "★" : "☆"}</Button>}
    {onRemove && <Button variant="bare" type="button" disabled={busy} onClick={() => onRemove(item)} aria-label={t('media.item.removeFromServer', { name: item.name })} className="absolute left-1 top-1 rounded bg-lc-black/80 px-1 py-0.5 text-xs text-red-300"><CloseIcon size={12} /></Button>}
  </div>;
}
