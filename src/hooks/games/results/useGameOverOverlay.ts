'use client';

import { useState, type MouseEvent } from 'react';
import type { GameSession } from '@/lib/games/session/session';
import { gameOverView, resultKeyOf } from '@/utils/games/results/game-over';

/**
 * The result splash's view model: whether it shows, what it says, and the two
 * ways to dismiss it.
 *
 * Dismissal is keyed to the result it dismissed, so a later match on the
 * same table re-arms the splash on its own, with no effect and no reset.
 */
export function useGameOverOverlay(session: GameSession, myPubkey: string | null, onClose: () => void) {
  const [dismissedResult, setDismissedResult] = useState<string | null>(null);
  const resultKey = resultKeyOf(session);
  const visible = session.status === 'finished' && dismissedResult !== resultKey;

  const dismiss = () => {
    setDismissedResult(resultKey);
    onClose();
  };

  return {
    view: visible ? gameOverView(session, myPubkey) : null,
    dismiss,
    /** The close button sits on the backdrop, which dismisses too: one dismissal, not two. */
    dismissFromButton: (e: MouseEvent) => {
      e.stopPropagation();
      dismiss();
    },
  };
}
