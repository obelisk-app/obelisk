'use client';

import type { TouchEvent } from 'react';

/**
 * A drag that starts within 24px of the left edge and travels 50px right
 * opens the drawer. Touch handlers for the shell root; `enabled` is false
 * while the drawer is already open.
 */
export function useEdgeSwipeOpen(enabled: boolean, onOpen: () => void) {
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX <= 24 && enabled) {
        e.currentTarget.dataset.swipeStart = String(t.clientX);
      }
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      const start = e.currentTarget.dataset.swipeStart;
      if (start === undefined) return;
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX - parseFloat(start) > 50) {
        onOpen();
        delete e.currentTarget.dataset.swipeStart;
      }
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => { delete e.currentTarget.dataset.swipeStart; },
  };
}
