'use client';

import { useTranslations } from 'next-intl';
import MediaThumb from '@/components/media/library/MediaThumb';
import { StarIcon } from '@/components/ui/icons/icons';
import type { MediaEntry } from '@/utils/chat/picker/media-catalog';

/** One media tile with its favourite star. */
export function MediaSectionTile({ entry, favorite, onPick, onFavorite, onMediaLoad, onMediaError }: {
  entry: MediaEntry;
  favorite: boolean;
  onPick: (entry: MediaEntry) => void;
  onFavorite: (entry: MediaEntry) => void;
  onMediaLoad: (entry: MediaEntry) => void;
  onMediaError: (entry: MediaEntry) => void;
}) {
  const t = useTranslations();
  return (
    <div className="relative h-full min-h-0 min-w-0">
      <button
        type="button"
        onClick={() => onPick(entry)}
        className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-lc-border bg-lc-black/60 p-2 transition-colors hover:border-lc-green/50 hover:bg-lc-black"
      >
        <MediaThumb
          src={entry.url}
          alt={':' + entry.name + ':'}
          onLoad={() => onMediaLoad(entry)}
          onError={() => onMediaError(entry)}
          className="block max-h-full max-w-full object-contain"
        />
      </button>
      <button
        type="button"
        onClick={() => onFavorite(entry)}
        aria-label={t(favorite ? 'chat.mediaPicker.removeFavorite' : 'chat.mediaPicker.addFavorite', { name: entry.name })}
        aria-pressed={favorite}
        className={"absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border bg-lc-black/85 transition-colors " + (favorite ? "border-lc-green text-lc-green" : "border-lc-border text-lc-white hover:border-lc-green/50")}
      >
        <StarIcon size={14} filled={favorite} />
      </button>
    </div>
  );
}
