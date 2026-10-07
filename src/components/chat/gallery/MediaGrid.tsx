'use client';

/**
 * The profile's Media tab, as an explore grid.
 *
 * It was a plain 3-column grid of square crops with a hairline gap and no
 * indication of what anything was: a video looked exactly like a photo
 * until you tapped it, and a note with four images contributed four
 * identical-looking tiles.
 *
 * Instagram's explore layout solves both: an edge-to-edge grid so the images
 * carry the page, a badge on anything that isn't a single still, and a
 * larger cell every so often so a wall of thumbnails has some rhythm. The
 * feature tile is index-based (not engagement-based) on purpose: it's
 * layout, not a ranking, and a grid that reshuffles as counts arrive is
 * worse than one that doesn't.
 */

import type { MediaItem } from '@/services/social/feed-media';
import { mediaGridTiles } from '@/utils/chat/gallery/gallery-layout';
import { MediaGridTile } from './MediaGridTile';

export default function MediaGrid({
  items,
  onOpen,
}: {
  items: readonly MediaItem[];
  onOpen: (url: string, noteId?: string) => void;
}) {
  return (
    <div
      className="grid grid-cols-3 gap-px bg-lc-border/40 sm:grid-cols-4"
      data-testid="profile-media-grid"
    >
      {mediaGridTiles(items).map((tile) => <MediaGridTile key={tile.item.key} tile={tile} onOpen={onOpen} />)}
    </div>
  );
}
