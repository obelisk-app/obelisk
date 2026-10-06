'use client';

import type { GameState, HexCoord } from 'vesta';
import type { GameSession } from '@/lib/games/session';
import type { VestaAction } from '@/lib/games/vesta/definition';
import VestaBoard from './VestaBoard';
import VestaPlayers from './VestaPlayers';
import VestaPrompts from './VestaPrompts';
import VestaTurnActions from './VestaTurnActions';
import VestaTradePanel from './VestaTradePanel';
import { useVestaTurn } from '@/hooks/chat/games/vesta/useVestaTurn';
import { useTranslations } from 'next-intl';

export interface VestaTableProps {
  session: GameSession;
  state: GameState;
  /** Seats this account may act for. Several means hot-seat on this machine. */
  mySeats: string[];
  seatLabel: (seatId: string) => string;
  onAction: (action: VestaAction, seat: string) => Promise<void>;
  busy?: boolean;
}

/**
 * The Vesta table: board plus the controls for whatever the game is currently
 * waiting on.
 *
 * Every button is gated by the engine's own `validateAction`, so the UI can
 * never offer a move the reducer would drop, which matters more here than in
 * Chain Reaction, because a rejected move over a relay is silent. If it is not
 * offered, it is not legal.
 */
export default function VestaTable({ session, state, mySeats, seatLabel, onAction, busy }: VestaTableProps) {
  const t = useTranslations();
  const turn = useVestaTurn({ session, state, mySeats, onAction });
  const { mode, send, myTurn, turnSeat } = turn;

  return (
    <div className="space-y-3">
      <VestaBoard
        state={state}
        mode={mode}
        onPickVertex={(spot) => {
          if (mode === 'city') void send({ type: 'place-city', ...spot } as VestaAction);
          else void send({ type: 'place-settlement', ...spot } as VestaAction);
        }}
        onPickEdge={(edge) => void send({ type: 'place-road', ...edge } as VestaAction)}
        onPickHex={(hex: HexCoord) => void send({ type: 'move-robber', q: hex.q, r: hex.r } as VestaAction)}
      />

      <VestaPlayers state={state} mySeats={mySeats} seatLabel={seatLabel} turn={turn} />
      <VestaPrompts state={state} seatLabel={seatLabel} busy={busy} turn={turn} />
      <VestaTurnActions state={state} busy={busy} turn={turn} />

      <VestaTradePanel state={state} seatLabel={seatLabel} busy={busy} turn={turn} />

      {!myTurn && state.winner === null && (
        <p className="text-center text-[11px] text-lc-muted">
          {t('games.vestaTable.waitingFor', { name: seatLabel(turnSeat ?? '') })}
        </p>
      )}
    </div>
  );
}
