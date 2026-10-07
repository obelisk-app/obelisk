'use client';

/**
 * Several images in one note, as one swipeable frame.
 *
 * Stacked, a four-image post was four full-width images to scroll past:
 * the note owned the viewport and everything after it was a scroll away.
 * Every other client renders a set as a carousel, and readers already know
 * the gesture.
 *
 * Scroll-snap rather than a JS slider: the swipe is the browser's, so it's
 * native-feeling on a phone and trackpad-scrollable on a desktop, and there
 * is no transform state to get out of sync with the DOM.
 */

import { Lightbox } from '@/components/chat/gallery/Lightbox';
import { useMediaCarousel } from '@/hooks/social/note/useMediaCarousel';
import type { CarouselItem } from '@/utils/social/media-carousel';
import CarouselSlide from './CarouselSlide';

export default function MediaCarousel({ items }: { items: readonly CarouselItem[] }) {
  const {
    trackRef, index, onScroll, goTo, stills, zoom, openAt, closeZoom, prevZoom, nextZoom,
  } = useMediaCarousel(items);

  if (items.length === 0) return null;
  if (items.length === 1) {
    return (
      <>
        <CarouselSlide item={items[0]} onOpen={openAt} />
        {zoom !== null && (
          <Lightbox urls={stills} index={zoom} onClose={closeZoom} onPrev={prevZoom} onNext={nextZoom} />
        )}
      </>
    );
  }

  return (
    <div className="relative" data-testid="media-carousel">
      <div
        ref={trackRef}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        data-testid="media-carousel-track"
      >
        {items.map((item) => (
          <div key={item.url} className="w-full shrink-0 snap-center">
            <CarouselSlide item={item} onOpen={openAt} />
          </div>
        ))}
      </div>

      {/* Count first: it's readable at a glance where dots are a guess. */}
      <span
        className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white"
        data-testid="media-carousel-count"
      >
        {index + 1}/{items.length}
      </span>

      <div className="mt-1.5 flex justify-center gap-1.5">
        {items.map((item, dot) => (
          <button
            key={item.url}
            type="button"
            onClick={() => goTo(dot)}
            aria-label={`${dot + 1}`}
            aria-current={dot === index}
            className={`h-1.5 rounded-full transition-all ${
              dot === index ? 'w-4 bg-lc-green' : 'w-1.5 bg-lc-border'
            }`}
            data-testid="media-carousel-dot"
          />
        ))}
      </div>

      {zoom !== null && (
        <Lightbox urls={stills} index={zoom} onClose={closeZoom} onPrev={prevZoom} onNext={nextZoom} />
      )}
    </div>
  );
}
