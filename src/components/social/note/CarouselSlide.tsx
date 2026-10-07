'use client';

import RemoteImage from '@/components/ui/media/RemoteImage';
import { isVideo } from '@/utils/attachments/attachments';
import { slideAspectRatio, type CarouselItem } from '@/utils/social/media-carousel';

/** One slide: a video with its poster, or an image that opens the lightbox. */
export default function CarouselSlide({ item, onOpen }: { item: CarouselItem; onOpen?: (url: string) => void }) {
  const ratio = slideAspectRatio(item);
  if (isVideo(item)) {
    return (
      <video
        src={item.url}
        controls
        playsInline
        // `poster` is the difference between a video note and a grey box
        // reading `0:00`. Without one there is nothing to look at until you
        // press play, so the card says nothing about itself in the feed.
        poster={item.poster ?? undefined}
        // With a poster there is already something to show, so don't spend
        // a metadata round trip on every video in the viewport.
        preload={item.poster ? 'none' : 'metadata'}
        className="w-full rounded-xl"
        style={ratio ? { aspectRatio: ratio } : undefined}
        data-testid="carousel-video"
      />
    );
  }
  return (
    <RemoteImage
      src={item.url}
      alt=""
      decoding="async"
      onClick={onOpen ? () => onOpen(item.url) : undefined}
      className={`w-full rounded-xl object-cover ${onOpen ? 'cursor-zoom-in' : ''}`}
      data-testid="carousel-image"
      // `imeta` dimensions reserve the space before the bytes arrive, which
      // is the whole point of the tag: without it the feed jumps as images
      // land under the reader.
      style={ratio ? { aspectRatio: ratio } : undefined}
    />
  );
}
