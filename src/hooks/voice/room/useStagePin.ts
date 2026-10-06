'use client';

/**
 * Who is pinned to the stage: that person's screen (preferred) or camera
 * takes the main stage and everyone else collapses to the rail. Any user can
 * pin or unpin from any tile.
 *
 * Leaving the call drops the pin. That used to be an effect, which painted
 * one frame with the stale pin and then rendered again; it is now adjusted
 * during render (React's "adjust state when a prop changes" pattern), which
 * React folds into the same render.
 */
import { useState, type Dispatch, type SetStateAction } from 'react';

export function useStagePin(joined: boolean): [string | null, Dispatch<SetStateAction<string | null>>] {
  const [pinned, setPinned] = useState<string | null>(null);
  if (!joined && pinned !== null) setPinned(null);
  return [pinned, setPinned];
}
