'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { FULLSCREEN_CHROME_PX } from '@/constants/games/table';

function subscribeResize(notify: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
}

/** Null when not fullscreen; otherwise the width and height the board may fill. */
export function useFullscreenBoardBox(fullscreen: boolean): { width: number; height: number } | null {
  // The window, read through a subscription rather than copied into state on
  // every resize: the size is external, and mirroring it would re-render the
  // whole table for a value only the board reads.
  const viewport = useSyncExternalStore(
    subscribeResize,
    () => `${window.innerWidth}x${window.innerHeight}`,
    () => '',
  );
  return useMemo(() => {
    if (!fullscreen || !viewport) return null;
    const [w, h] = viewport.split('x').map(Number);
    return {
      width: Math.max(240, w - 32),
      height: Math.max(240, h - FULLSCREEN_CHROME_PX),
    };
  }, [fullscreen, viewport]);
}
