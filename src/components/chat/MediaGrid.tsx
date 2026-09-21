'use client';

/**
 * The profile's Media tab, as an explore grid.
 *
 * It was a plain 3-column grid of square crops with a hairline gap and no
 * indication of what anything was — a video looked exactly like a photo
 * until you tapped it, and a note with four images contributed four
 * identical-looking tiles.
 *
 * Instagram's explore layout solves both: an edge-to-edge grid so the images
 * carry the page, a badge on anything that isn't a single still, and a
 * larger cell every so often so a wall of thumbnails has some rhythm. The
 * feature tile is index-based (not engagement-based) on purpose — it's
 * layout, not a ranking, and a grid that reshuffles as counts arrive is
 * worse than one that doesn't.
 */

import { isVideoUrl } from '@/lib/attachments';
import { useTranslation } from '@/i18n/context';

export type MediaItem = { key: string; url: string; multiple?: boolean };

/** Every Nth tile spans 2×2. 7 keeps the pattern from looking like columns. */
const FEATURE_EVERY = 7;

export default function MediaGrid({
  items,
  onOpen,
}: {
  items: readonly MediaItem[];
  onOpen: (url: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="grid grid-cols-3 gap-px bg-lc-border/40 sm:grid-cols-4"
      data-testid="profile-media-grid"
    >
      {items.map((item, index) => {
        const featured = index > 0 && index % FEATURE_EVERY === 0;
        const video = isVideoUrl(item.url);
        return (
          <button
            type="button"
            key={item.key}
            onClick={() => onOpen(item.url)}
            className={`group relative aspect-square overflow-hidden bg-lc-dark ${
              featured ? 'col-span-2 row-span-2' : ''
            }`}
            aria-label={t('profileFeed.openMedia')}
            data-testid="profile-media-tile"
            data-featured={featured || undefined}
          >
            {video ? (
              <video
                src={item.url}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                loading="lazy"
                decoding="async"
                // The zoom is the only hover affordance: a grid with no
                // borders gives no other hint that a tile is clickable.
                className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
              />
            )}

            {(video || item.multiple) && (
              <span
                className="pointer-events-none absolute right-1.5 top-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
                aria-hidden="true"
                data-testid={video ? 'media-badge-video' : 'media-badge-multi'}
              >
                {video ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="8" y="3" width="13" height="13" rx="2" />
                    <path d="M3 8v11a2 2 0 0 0 2 2h11" />
                  </svg>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
