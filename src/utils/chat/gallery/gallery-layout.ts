import { isVideoUrl } from '@/utils/attachments/attachments';
import type { MediaItem } from '@/services/social/feed-media';

/** One tile of a chat image matrix. */
export interface GalleryTileModel {
  readonly url: string;
  /** The image's position in the message, which the lightbox opens on. */
  readonly index: number;
  readonly key: string;
  /** `row-span-2` for the big left tile of a three-image layout. */
  readonly spanClass: string;
  /** How many images the last tile hides ("+N"), 0 on every other tile. */
  readonly more: number;
}

/**
 * The matrix for two or more images (one image is drawn on its own): the
 * first four as tiles, the grid classes and aspect ratio for the count.
 * Three images put the first one across both rows; five or more show "+N"
 * on the fourth.
 */
export function galleryLayout(urls: ReadonlyArray<string>) {
  const overflow = urls.length - 4;
  const tiles: GalleryTileModel[] = urls.slice(0, 4).map((url, i) => ({
    url,
    index: i,
    key: `${url}-${i}`,
    spanClass: urls.length === 3 && i === 0 ? 'row-span-2' : '',
    more: i === 3 && overflow > 0 ? overflow : 0,
  }));
  return {
    tiles,
    gridClass: urls.length === 2 ? 'grid-cols-2 grid-rows-1' : 'grid-cols-2 grid-rows-2',
    aspectRatio: urls.length === 2 ? '2 / 1' : '1 / 1',
  };
}

/** Every Nth tile of the profile media grid spans 2x2. 7 keeps the pattern from looking like columns. */
export const FEATURE_EVERY = 7;

/** One tile of the profile media grid: featured (2x2) every `FEATURE_EVERY`, never the first; video or still. */
export interface MediaGridTileModel {
  readonly item: MediaItem;
  readonly featured: boolean;
  readonly video: boolean;
}

export function mediaGridTiles(items: ReadonlyArray<MediaItem>): MediaGridTileModel[] {
  return items.map((item, index) => ({
    item,
    featured: index > 0 && index % FEATURE_EVERY === 0,
    video: isVideoUrl(item.url),
  }));
}
