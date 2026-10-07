import { useCallback, useRef, useState } from 'react';
import { carouselStills, slideAt, wrapIndex, type CarouselItem } from '@/utils/social/media-carousel';

/**
 * The media carousel's view model: the scroll-snap track's ref, the slide
 * the dots point at, jumping to a slide, and the lightbox over the stills.
 *
 * Zoom, like every other image in the app: a picture note rendered through
 * the carousel had no way to be opened at all, where the markdown path had a
 * lightbox.
 */
export function useMediaCarousel(items: readonly CarouselItem[]) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState<number | null>(null);
  const stills = carouselStills(items);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const next = slideAt(track.scrollLeft, track.clientWidth);
    setIndex((current) => (current === next ? current : next));
  }, []);

  return {
    trackRef,
    index,
    onScroll,
    goTo: (target: number) => {
      const track = trackRef.current;
      track?.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
    },
    stills,
    zoom,
    openAt: (url: string) => {
      const at = stills.indexOf(url);
      if (at >= 0) setZoom(at);
    },
    closeZoom: () => setZoom(null),
    prevZoom: () => setZoom((at) => wrapIndex(at, -1, stills.length)),
    nextZoom: () => setZoom((at) => wrapIndex(at, 1, stills.length)),
  };
}
