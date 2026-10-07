import { useCallback, useRef, useState } from 'react';
import { useLightboxIndex } from '@/hooks/chat/gallery/useLightboxIndex';
import { carouselStills, slideAt, type CarouselItem } from '@/utils/social/media-carousel';

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
  const stills = carouselStills(items);
  // The chat gallery's lightbox state, keyboard included: Escape closes, the arrows step.
  const lightbox = useLightboxIndex(stills.length);

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
    zoom: lightbox.lightboxIndex,
    openAt: (url: string) => {
      const at = stills.indexOf(url);
      if (at >= 0) lightbox.setLightboxIndex(at);
    },
    closeZoom: lightbox.close,
    prevZoom: lightbox.prev,
    nextZoom: lightbox.next,
  };
}
