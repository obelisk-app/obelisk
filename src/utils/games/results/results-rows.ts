import type { GameSession } from '@/lib/games/session/session';
import { standingsFor, type Score, type ScoreDetail } from '@/lib/games/core/standings';
import { SEAT_COLORS } from '../chain-reaction/seat-colors';
import { VESTA_PLAYER_COLORS } from '../vesta/palette';

export interface Row {
  seat: string;
  score: Score;
  color: string;
  detail?: ScoreDetail;
}

/** Standings from the shared scorer, painted in each game's seat colours. */
export function rowsFor(session: GameSession): Row[] {
  const palette = session.game === 'vesta' ? VESTA_PLAYER_COLORS : SEAT_COLORS.map((c) => c.hex);
  return standingsFor(session).map((row) => ({
    seat: row.seat,
    score: row.score,
    detail: row.detail,
    color: palette[session.participants.indexOf(row.seat)] ?? '#a3a3a3',
  }));
}
