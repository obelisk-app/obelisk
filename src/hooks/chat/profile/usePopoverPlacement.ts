'use client';

import { useLayoutEffect, type RefObject } from 'react';

/**
 * Pin the panel beside the click that opened it: to the right of the point
 * when it fits, else to the left; below when it clears the bottom 88px,
 * else above. Re-placed on resize and whenever the panel's own size
 * changes (the profile arriving grows it).
 */
export function usePopoverPlacement(
  panelRef: RefObject<HTMLElement | null>,
  anchor: { x: number; y: number } | null,
): void {
  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return;
    const panel = panelRef.current;
    const place = () => {
      const left = anchor.x + panel.offsetWidth + 12 <= window.innerWidth
        ? anchor.x + 12
        : Math.max(12, anchor.x - panel.offsetWidth - 12);
      const bottomEdge = window.innerHeight - 88;
      const top = anchor.y + panel.offsetHeight + 8 <= bottomEdge
        ? anchor.y + 8
        : Math.max(12, anchor.y - panel.offsetHeight - 8);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };
    place();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    observer?.observe(panel);
    window.addEventListener('resize', place);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchor, panelRef]);
}
