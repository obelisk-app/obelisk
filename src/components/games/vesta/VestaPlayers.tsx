'use client';

import type { GameState } from 'vesta';
import { VESTA_PLAYER_COLORS } from '@/utils/games/vesta/palette';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { useVestaPlayers } from '@/hooks/games/vesta/useVestaPlayers';
import { useTranslations } from 'next-intl';

/** One tile per seat (colour, name, points, cards) and the status line under them. */
export default function VestaPlayers({ state, mySeats, seatLabel, turn }: {
  state: GameState;
  mySeats: string[];
  seatLabel: (seatId: string) => string;
  turn: Pick<VestaTurn, 'participants' | 'turnIdx' | 'turnSeat' | 'isSetup'>;
}) {
  const t = useTranslations();
  const { tiles, status } = useVestaPlayers({ state, mySeats, turn });
  return (
    <>
      {/* Players */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {tiles.map((tile) => (
          <div
            key={tile.seat}
            className={`rounded-lg border p-2 ${tile.onMove ? 'border-lc-white' : 'border-lc-border'}`}
            data-testid={`vesta-player-${tile.index}`}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: VESTA_PLAYER_COLORS[tile.index] }} />
              <span className={`truncate text-[11px] ${tile.mine ? 'text-lc-white' : 'text-lc-muted'}`}>
                {seatLabel(tile.seat)}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-lc-muted">
              <span>{t('games.score.vp', { count: tile.vp })}</span>
              <span>{tile.cards}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Status line */}
      <div className="rounded-lg border border-lc-border bg-lc-black/40 p-2 text-center text-[11px] text-lc-muted">
        {status.kind === 'won'
          ? t('games.vestaTable.wins', { name: seatLabel(status.seat) })
          : status.kind === 'setup'
            ? t(status.step === 'road' ? 'games.vestaTable.setupRoad' : 'games.vestaTable.setupSettlement', {
              name: seatLabel(status.seat),
            })
            : status.kind === 'dice'
              ? `🎲 ${status.dice[0]} + ${status.dice[1]} = ${status.total}`
              : t('games.vestaTable.toRoll', { name: seatLabel(status.seat) })}
      </div>
    </>
  );
}
