'use client';

import { useMemo, useSyncExternalStore } from 'react';

/**
 * The room a fullscreen board actually gets.
 *
 * Turn-based boards used to take a width cap and nothing else, so fullscreen
 * on Chain Reaction was a 264px board adrift in a 1440px window: the cell
 * size was capped and there was no height to fill. Measuring here keeps the
 * board component free of window queries, the same way StackerTable already
 * sizes its own cells.
 *
 * The subtraction is the chrome above and below: title row, turn clock,
 * seat legend, and the action buttons. The title row is the shared
 * ModalHeader since round 27: 65px (py-3, a 24px title over a 16px status
 * line, the hairline) plus the body's 12px top padding, where the old
 * hand-built row took 60.5px (12px panel padding, 20px title over a 16.5px
 * status line, a 12px gap). So 210 became 227 (16.5 rounded up).
 */
export const FULLSCREEN_CHROME_PX = 227;

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
