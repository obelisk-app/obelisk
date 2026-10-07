'use client';

import { useTranslations } from 'next-intl';
import type { GameSession } from '@/lib/games/session/session';
import { isDraw } from '@/lib/games/core/standings';
import { resultRows } from '@/utils/games/results/results-view';

/** The results panel's view model: the standings and the one-line outcome. */
export function useGameResults(session: GameSession, seatLabel: (seatId: string) => string, myPubkey: string | null) {
  const t = useTranslations();
  const rows = resultRows(session, myPubkey);
  return {
    rows,
    outcome: session.winner
      ? t('games.results.won', { name: seatLabel(session.winner) })
      // A solo run has no winner and no draw: it simply ended.
      : t(isDraw(session) ? 'games.results.draw' : 'games.results.over'),
    /** What a game's score means, from the leader's row. */
    detail: rows[0]?.detail ?? null,
  };
}
