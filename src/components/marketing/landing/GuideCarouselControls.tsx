'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeftIcon, ChevronRightIcon } from '@/assets/icons';

type Props = {
  /** The id of the scroll-snap track the buttons page through. */
  trackId: string;
  prevLabel: string;
  nextLabel: string;
};

const BUTTON = 'grid size-10 place-items-center rounded-full border border-lc-border bg-lc-dark text-lc-white transition-colors hover:border-lc-green/50 hover:text-lc-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lc-green disabled:pointer-events-none disabled:opacity-30';

/**
 * Previous / next for the Learn carousel. The track itself is plain CSS
 * scroll-snap (swipe and trackpad work without this); the buttons page it by
 * most of a viewport and grey out at either end.
 */
export default function GuideCarouselControls({ trackId, prevLabel, nextLabel }: Props) {
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = document.getElementById(trackId);
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, [trackId]);

  useEffect(() => {
    const el = document.getElementById(trackId);
    if (!el) return;
    const first = requestAnimationFrame(measure);
    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(first);
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [trackId, measure]);

  const page = (dir: 1 | -1) => {
    const el = document.getElementById(trackId);
    el?.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  return (
    <div className="flex items-center gap-2">
      <button type="button" aria-controls={trackId} aria-label={prevLabel} disabled={edges.start} onClick={() => page(-1)} className={BUTTON}>
        <ChevronLeftIcon size={18} />
      </button>
      <button type="button" aria-controls={trackId} aria-label={nextLabel} disabled={edges.end} onClick={() => page(1)} className={BUTTON}>
        <ChevronRightIcon size={18} />
      </button>
    </div>
  );
}
