import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { RAIL_HORIZONTAL_QUERY, railScrollBy, railScrollState } from '@/utils/voice/rail-scroll';

const isHorizontal = () => window.matchMedia(RAIL_HORIZONTAL_QUERY).matches;

/**
 * The scrollable rail's view model: the rail element, whether to show the
 * previous and next arrows (re-measured on scroll, resize and whenever the
 * rail or a tile in it changes size), and the arrows' scroll.
 * `children` is the rail's content, so a tile added or removed re-measures.
 */
export function useScrollableRail(children: ReactNode) {
  const railRef = useRef<HTMLElement | null>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const update = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const state = railScrollState(el, isHorizontal());
    setCanPrev(state.canPrev);
    setCanNext(state.canNext);
  }, []);

  useEffect(() => {
    update();
    const el = railRef.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    Array.from(el.children).forEach((c) => ro.observe(c));
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, [update, children]);

  return {
    railRef,
    canPrev,
    canNext,
    update,
    scroll: (dir: 1 | -1) => {
      const el = railRef.current;
      if (el) el.scrollBy(railScrollBy(el, isHorizontal(), dir));
    },
  };
}
