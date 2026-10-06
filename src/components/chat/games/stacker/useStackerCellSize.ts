'use client';

import { useEffect, useState } from 'react';
import { HEIGHT } from '@/lib/games/stacker/engine';

/**
 * Size the cells to the space available rather than to a constant. A fixed
 * 26px board is 520px tall, which is taller than a phone's usable area and
 * taller than the modal, so it was getting cut off at the top and bottom.
 */
export function useStackerCellSize(fullscreen: boolean | undefined): number {
  const [cell, setCell] = useState(26);
  useEffect(() => {
    const measure = () => {
      if (typeof window === 'undefined') return;
      // Leave room for the rails, the opponents strip and the controls line.
      const chrome = fullscreen ? 190 : 260;
      const byHeight = Math.floor((window.innerHeight - chrome) / HEIGHT);
      const byWidth = Math.floor((window.innerWidth - 190) / 10);
      setCell(Math.max(12, Math.min(30, byHeight, byWidth)));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullscreen]);

  return cell;
}
