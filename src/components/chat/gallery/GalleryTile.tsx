'use client';

import Button from '@/components/ui/buttons/Button';
import type { SyntheticEvent } from 'react';
import RemoteImage from '@/components/ui/media/RemoteImage';
import type { GalleryTileModel } from '@/utils/chat/gallery/gallery-layout';

/** One tile of a chat image matrix; the last of five or more shows how many more there are. */
export function GalleryTile({ tile, onOpen, onError }: {
  tile: GalleryTileModel;
  onOpen: (index: number) => void;
  onError: (e: SyntheticEvent<HTMLImageElement>) => void;
}) {
  return (
    <Button
      variant="bare"
      type="button"
      onClick={() => onOpen(tile.index)}
      className={`relative overflow-hidden bg-lc-black/50 ${tile.spanClass}`}
      data-testid="gallery-tile"
    >
      <RemoteImage src={tile.url} alt="" className="w-full h-full object-cover" onError={onError} />
      {tile.more > 0 && (
        <div
          className="absolute inset-0 bg-black/60 flex items-center justify-center text-lc-white text-xl font-bold"
          data-testid="overflow-overlay"
        >
          +{tile.more}
        </div>
      )}
    </Button>
  );
}
