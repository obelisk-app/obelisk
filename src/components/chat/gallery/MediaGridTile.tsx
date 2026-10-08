'use client';

import Button from '@/components/ui/buttons/Button';
import { useTranslations } from 'next-intl';
import RemoteImage from '@/components/ui/media/RemoteImage';
import type { MediaGridTileModel } from '@/utils/chat/gallery/gallery-layout';
import { PlayIcon, StackIcon } from '@/assets/icons';

/** One tile of the profile media grid: the still or video, a 2x2 feature cell now and then, and a badge on a video or a multi-image note. */
export function MediaGridTile({ tile, onOpen }: { tile: MediaGridTileModel; onOpen: (url: string, noteId?: string) => void }) {
  const t = useTranslations();
  const { item, featured, video } = tile;
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onOpen(item.url, item.noteId)}
      className={`group relative aspect-square overflow-hidden bg-lc-dark ${
        featured ? 'col-span-2 row-span-2' : ''
      }`}
      aria-label={t('social.profileFeed.openMedia')}
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
        <RemoteImage
          src={item.url}
          alt=""
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
            <PlayIcon />
          ) : (
            <StackIcon size={15} strokeWidth={2} />
          )}
        </span>
      )}
    </Button>
  );
}
