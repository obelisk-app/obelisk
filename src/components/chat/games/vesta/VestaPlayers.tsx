'use client';

import type { GameState } from 'vesta';
import { VESTA_PLAYER_COLORS } from './palette';
import { RESOURCES, RESOURCE_EMOJI } from './resources';
import type { VestaTurn } from './useVestaTurn';

/** One tile per seat (colour, name, points, cards) and the status line under them. */
export default function VestaPlayers({ state, mySeats, seatLabel, turn }: {
  state: GameState;
  mySeats: string[];
  seatLabel: (seatId: string) => string;
  turn: Pick<VestaTurn, 'participants' | 'turnIdx' | 'turnSeat' | 'isSetup'>;
}) {
  const { participants, turnIdx, turnSeat, isSetup } = turn;
  return (
    <>
      {/* Players */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {participants.map((seat, i) => {
          const p = state.players[i];
          if (!p) return null;
          const onMove = i === turnIdx;
          const mine = mySeats.includes(seat);
          return (
            <div
              key={seat}
              className={`rounded-lg border p-2 ${onMove ? 'border-lc-white' : 'border-lc-border'}`}
              data-testid={`vesta-player-${i}`}
            >
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: VESTA_PLAYER_COLORS[i] }} />
                <span className={`truncate text-[11px] ${mine ? 'text-lc-white' : 'text-lc-muted'}`}>
                  {seatLabel(seat)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-lc-muted">
                <span>{p.vp} VP</span>
                <span>
                  {mine
                    ? RESOURCES.map((r) => `${RESOURCE_EMOJI[r]}${p.resources[r] ?? 0}`).join(' ')
                    : `🎴 ${RESOURCES.reduce((n, r) => n + (p.resources[r] ?? 0), 0)}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Status line */}
      <div className="rounded-lg border border-lc-border bg-lc-black/40 p-2 text-center text-[11px] text-lc-muted">
        {state.winner !== null && state.winner !== undefined
          ? `${seatLabel(participants[state.winner] ?? '')} wins`
          : isSetup
            ? `Setup: ${seatLabel(turnSeat ?? '')} places a ${state.setupStep}`
            : state.dice
              ? `🎲 ${state.dice[0]} + ${state.dice[1]} = ${state.dice[0] + state.dice[1]}`
              : `${seatLabel(turnSeat ?? '')} to roll`}
      </div>
    </>
  );
}
