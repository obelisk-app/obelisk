/**
 * The result splash's reading of a finished table, from one viewer's seat:
 * did they win, lose or only watch, what they finished with, and the colour
 * the headline wears.
 */
import type { GameSession } from '@/lib/games/session/session';
import { isDraw, scoreFor, type Score } from '@/lib/games/core/standings';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';
import type { MessageKey } from '@/i18n/keys';
import { FALLBACK_WINNER_HEX, NEUTRAL_HEX, LOSER_HEX } from '@/constants/games/results';

export interface GameOverView {
  winner: string | null;
  draw: boolean;
  iWon: boolean;
  iLost: boolean;
  myScore: Score | null;
  /** The headline's colour. */
  color: string;
  headlineKey: MessageKey;
}

/** Which result, under the key a splash for it shows. */
export function resultKeyOf(session: GameSession): string {
  return `${session.id}:${session.finishedAt ?? ''}`;
}

export function gameOverView(session: GameSession, myPubkey: string | null): GameOverView {
  const winner = session.winner;
  // Seats, not pubkeys: one account can hold several, and on a solo table the
  // seat id is not the pubkey once extra seats exist.
  const mySeats = session.seats.filter((s) => s.by === myPubkey).map((s) => s.id);
  const iWon = !!winner && (winner === myPubkey || mySeats.includes(winner));
  const iPlayed = mySeats.length > 0 || (!!myPubkey && session.participants.includes(myPubkey));
  const iLost = iPlayed && !iWon;
  const draw = isDraw(session);
  const winnerSeat = winner ? session.participants.indexOf(winner) : -1;
  const accent = winnerSeat >= 0 ? SEAT_COLORS[winnerSeat]?.hex ?? FALLBACK_WINNER_HEX : NEUTRAL_HEX;
  return {
    winner,
    draw,
    iWon,
    iLost,
    myScore: scoreFor(session, mySeats[0] ?? (iPlayed ? myPubkey : null)),
    color: iLost ? LOSER_HEX : accent,
    headlineKey: draw ? 'games.overlay.draw'
      : iWon ? 'games.overlay.youWon'
        : iLost ? 'games.overlay.youLost'
          : 'games.overlay.over',
  };
}
