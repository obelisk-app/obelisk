/**
 * The final standings as the results panel lists them: the shared scorer's
 * rows in each game's seat colours, with the winner and the viewer's own
 * seats marked.
 */
import type { GameSession } from '@/lib/games/session/session';
import { rowsFor, type Row } from '@/utils/games/results/results-rows';

export interface ResultRow extends Row {
  isWinner: boolean;
  /** One of the viewer's own seats. */
  mine: boolean;
}

export function resultRows(session: GameSession, myPubkey: string | null): ResultRow[] {
  const mine = session.seats.filter((s) => s.by === myPubkey).map((s) => s.id);
  return rowsFor(session).map((row) => ({
    ...row,
    isWinner: row.seat === session.winner,
    mine: mine.includes(row.seat),
  }));
}
