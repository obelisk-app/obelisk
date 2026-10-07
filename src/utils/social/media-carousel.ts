/**
 * The media carousel's arithmetic: which slide a scroll position shows,
 * which items the lightbox can zoom, and stepping through them with
 * wrap-around.
 */
import { isVideo } from '@/utils/attachments/attachments';

/** One image or video in a note, from its `imeta` tag (or a NIP-94 `url`). */
export type CarouselItem = {
  url: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  /** NIP-71 poster frame, from the `imeta` `image`/`thumb` field. */
  poster?: string | null;
};

/**
 * The slide nearest the track's scroll position. Round rather than floor:
 * mid-swipe the nearest slide is the one the dots should already be
 * pointing at.
 */
export function slideAt(scrollLeft: number, clientWidth: number): number {
  return Math.round(scrollLeft / Math.max(clientWidth, 1));
}

/**
 * The urls the lightbox can show: the stills, not the videos. A video is
 * recognised the way the slide recognises it (`isVideo`: the declared type,
 * else the extension), so a slide that plays as a video is never also a
 * lightbox image.
 */
export function carouselStills(items: readonly CarouselItem[]): string[] {
  return items.filter((item) => !isVideo(item)).map((item) => item.url);
}

/** The CSS aspect ratio `imeta` dimensions reserve, so the feed doesn't jump as media lands. */
export function slideAspectRatio(item: Pick<CarouselItem, 'width' | 'height'>): string | undefined {
  return item.width && item.height ? `${item.width}/${item.height}` : undefined;
}
