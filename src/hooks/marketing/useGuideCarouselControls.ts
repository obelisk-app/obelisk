'use client';

import { useCallback, useEffect, useState } from 'react';

/** How close to an end (px) still counts as there, so a sub-pixel scroll doesn't light a button. */
const EDGE_SLACK = 4;
/** Share of the track's width one press pages by. */
const PAGE = 0.85;

/**
 * Previous / next state for a scroll-snap track found by id: whether it sits
 * at either end (measured on the first frame, on scroll and on resize), and
 * `page`, which scrolls it by most of its width.
 */
export function useGuideCarouselControls(trackId: string) {
  const [edges, setEdges] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = document.getElementById(trackId);
    if (!el) return;
    setEdges({ start: el.scrollLeft <= EDGE_SLACK, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - EDGE_SLACK });
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

  const page = useCallback((dir: 1 | -1) => {
    const el = document.getElementById(trackId);
    el?.scrollBy({ left: dir * el.clientWidth * PAGE, behavior: 'smooth' });
  }, [trackId]);

  return { atStart: edges.start, atEnd: edges.end, page };
}
