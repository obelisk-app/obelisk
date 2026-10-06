'use client';

import type { ReactNode } from 'react';
import { normalizeCustomEmojiName } from '@/utils/media-tags/custom-emoji-tags';
import MediaThumb from '@/components/media/MediaThumb';
import { StarIcon } from '@/components/ui/icons';
import type { MediaEntry } from '@/utils/chat/picker/media-catalog';

/** A titled grid of media tiles, each with a favourite star; an optional leading tile (the create control). */
export function MediaSection({ title, entries, onPick, favoriteUrls, onFavorite, onMediaLoad, onMediaError, children }: {
  title: string;
  entries: readonly MediaEntry[];
  onPick: (entry: MediaEntry) => void;
  favoriteUrls: ReadonlySet<string>;
  onFavorite: (entry: MediaEntry) => void;
  onMediaLoad: (entry: MediaEntry) => void;
  onMediaError: (entry: MediaEntry) => void;
  children?: ReactNode;
}) {
  if (!children && entries.length === 0) return null;
  return (
    <section className="mb-3" data-testid={'media-section-' + normalizeCustomEmojiName(title)}>
      <h3 className="sticky top-0 z-10 mb-2 border-b border-lc-border bg-[var(--picker-surface,var(--color-lc-dark))] py-2 text-[11px] font-bold uppercase tracking-wider text-lc-muted">{title}</h3>
      <div className="grid grid-cols-4 auto-rows-[82px] content-start gap-2">
        {children}
        {entries.map((entry) => {
          const favorite = favoriteUrls.has(entry.url);
          return (
            <div key={entry.url} className="relative h-full min-h-0 min-w-0">
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
                aria-label={(favorite ? 'Remove :' : 'Add :') + entry.name + ': ' + (favorite ? 'from favorites' : 'to favorites')}
                aria-pressed={favorite}
                className={"absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full border bg-lc-black/85 transition-colors " + (favorite ? "border-lc-green text-lc-green" : "border-lc-border text-lc-white hover:border-lc-green/50")}
              >
                <StarIcon size={14} filled={favorite} />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
