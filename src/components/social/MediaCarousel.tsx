'use client';

/**
 * Several images in one note, as one swipeable frame.
 *
 * Stacked, a four-image post was four full-width images to scroll past —
 * the note owned the viewport and everything after it was a scroll away.
 * Every other client renders a set as a carousel, and readers already know
 * the gesture.
 *
 * Scroll-snap rather than a JS slider: the swipe is the browser's, so it's
 * native-feeling on a phone and trackpad-scrollable on a desktop, and there
 * is no transform state to get out of sync with the DOM.
 */

import { useCallback, useRef, useState } from 'react';

export type CarouselItem = {
  url: string;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
};

export default function MediaCarousel({ items }: { items: readonly CarouselItem[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const onScroll = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    // Round rather than floor: mid-swipe the nearest slide is the one the
    // dots should already be pointing at.
    const next = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    setIndex((current) => (current === next ? current : next));
  }, []);

  const goTo = (target: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: target * track.clientWidth, behavior: 'smooth' });
  };

  if (items.length === 0) return null;
  if (items.length === 1) return <Slide item={items[0]} />;

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
            <Slide item={item} />
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
    </div>
  );
}

function Slide({ item }: { item: CarouselItem }) {
  const ratio = item.width && item.height ? `${item.width}/${item.height}` : undefined;
  if (item.mimeType?.startsWith('video/')) {
    return (
      <video
        src={item.url}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-xl"
        style={ratio ? { aspectRatio: ratio } : undefined}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={item.url}
      alt=""
      loading="lazy"
      decoding="async"
      className="w-full rounded-xl object-cover"
      // `imeta` dimensions reserve the space before the bytes arrive, which
      // is the whole point of the tag — without it the feed jumps as images
      // land under the reader.
      style={ratio ? { aspectRatio: ratio } : undefined}
    />
  );
}
