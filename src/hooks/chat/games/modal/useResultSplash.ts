'use client';

import { useEffect, useState } from 'react';

/**
 * How long the result splash waits before covering the board.
 *
 * The deciding move is the biggest cascade in the game and it arrives in the
 * same event that ends the match, so a splash that renders immediately hides
 * the only explosion anybody wanted to watch. The board reports when it is
 * animating (`onRevealChange`); this short delay covers the gap between the
 * finished session landing and the board starting to play it back.
 */
export const RESULT_SPLASH_DELAY_MS = 300;
/** …and a ceiling, so a board that never reports "done" cannot eat the splash. */
export const RESULT_SPLASH_MAX_WAIT_MS = 6000;

/**
 * Whether the game-over splash may show. `setBoardRevealing` is what the
 * board calls while it plays back a cascade; the splash waits for it.
 */
export function useResultSplash(gameId: string, finished: boolean, finishedAt: number | null | undefined) {
  const [boardRevealing, setBoardRevealing] = useState(false);

  // Arm the splash a beat after the table finishes. Keyed by the result it is
  // armed for, so it is derived rather than reset: a rematch on the same
  // table id re-arms on its own, with no second effect to turn it back off.
  const resultKey = `${gameId}:${finishedAt ?? ''}`;
  const [splashArmedFor, setSplashArmedFor] = useState<string | null>(null);
  const splashReady = finished && splashArmedFor === resultKey;
  useEffect(() => {
    if (!finished) return;
    const t = setTimeout(() => setSplashArmedFor(resultKey), RESULT_SPLASH_DELAY_MS);
    return () => clearTimeout(t);
  }, [finished, resultKey]);

  // The ceiling: however long the board claims to be animating, the result
  // gets shown. A splash nobody can dismiss is worse than one that lands early.
  useEffect(() => {
    if (!finished || !boardRevealing) return;
    const t = setTimeout(() => setBoardRevealing(false), RESULT_SPLASH_MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, [finished, boardRevealing]);

  return { showSplash: splashReady && !boardRevealing, setBoardRevealing };
}
