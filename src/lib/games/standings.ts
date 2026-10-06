/**
 * Final standings, scored the way each game actually scores.
 *
 * Lives here rather than in a component because two surfaces need it: the
 * results table, and the end-of-game splash that wants to tell you what you
 * finished with. Colours stay in the components; this is about numbers.
 */
import type { GameState as VestaState } from 'vesta';
import type { GameSession } from './session';
import type { CRState } from './chain-reaction';

/**
 * A seat's final score, as data: each game counts something different, and
 * the table words it in the reader's language (`scoreLabel` in
 * `src/utils/chat/games/game-copy.ts`).
 */
export type Score =
  | { kind: 'vp'; vp: number }
  | { kind: 'stacker'; attacks: number; lines: number }
  | { kind: 'orbs'; orbs: number }
  | { kind: 'out' }
  | { kind: 'winner' }
  | { kind: 'none' };

/** What a game's score means, shown once under the table. */
export type ScoreDetail = 'vp' | 'stacker' | 'orbs';

export interface Standing {
  seat: string;
  score: Score;
  /** Sort key, descending. */
  sort: number;
  detail?: ScoreDetail;
}

export function standingsFor(session: GameSession): Standing[] {
  const seats = session.participants;

  if (session.game === 'vesta' && session.state) {
    const state = session.state as VestaState;
    return seats
      .map((seat, i): Standing => ({
        seat,
        score: { kind: 'vp', vp: state.players[i]?.vp ?? 0 },
        sort: state.players[i]?.vp ?? 0,
        detail: 'vp',
      }))
      .sort((a, b) => b.sort - a.sort);
  }

  if (session.match) {
    // Stacker: garbage sent is the number that decided the match, with lines
    // as the tiebreak.
    return seats
      .map((seat): Standing => {
        const p = session.match!.progress[seat];
        return {
          seat,
          score: { kind: 'stacker', attacks: p?.attacksSent ?? 0, lines: p?.linesCleared ?? 0 },
          sort: (p?.attacksSent ?? 0) * 1000 + (p?.linesCleared ?? 0),
          detail: 'stacker',
        };
      })
      .sort((a, b) => b.sort - a.sort);
  }

  if (session.game === 'chain-reaction' && session.state) {
    const state = session.state as CRState;
    const owned = new Map<string, number>();
    for (const cell of state.cells) {
      if (cell.owner === null) continue;
      const seat = state.order[cell.owner];
      if (seat) owned.set(seat, (owned.get(seat) ?? 0) + cell.count);
    }
    return seats
      .map((seat): Standing => ({
        seat,
        score: session.eliminated.includes(seat)
          ? { kind: 'out' }
          : { kind: 'orbs', orbs: owned.get(seat) ?? 0 },
        sort: session.eliminated.includes(seat) ? -1 : (owned.get(seat) ?? 0),
        detail: 'orbs',
      }))
      .sort((a, b) => b.sort - a.sort);
  }

  return seats.map((seat): Standing => ({
    seat,
    score: seat === session.winner
      ? { kind: 'winner' }
      : session.eliminated.includes(seat) ? { kind: 'out' } : { kind: 'none' },
    sort: seat === session.winner ? 1 : 0,
  }));
}

/** One seat's final score, or null if it wasn't at the table. */
export function scoreFor(session: GameSession, seat: string | null): Score | null {
  if (!seat) return null;
  return standingsFor(session).find((row) => row.seat === seat)?.score ?? null;
}

/**
 * Did this end in an actual draw?
 *
 * A game with no winner is not automatically a draw: a solo run ends with
 * nobody winning because there was nobody to beat, and calling that "draw:
 * nobody took the board" is both wrong and slightly insulting to whoever just
 * lost with a score on the table.
 */
export function isDraw(session: GameSession): boolean {
  return session.draw && session.participants.length > 1;
}
