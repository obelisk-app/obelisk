'use client';

import VestaBoard from './VestaBoard';
import VestaPlayers from './VestaPlayers';
import VestaPrompts from './VestaPrompts';
import VestaTurnActions from './VestaTurnActions';
import VestaTradePanel from './VestaTradePanel';
import { useVestaTable, type VestaTableInput } from '@/hooks/games/vesta/useVestaTable';
import { useTranslations } from 'next-intl';

export interface VestaTableProps extends VestaTableInput {
  seatLabel: (seatId: string) => string;
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
export default function VestaTable({ seatLabel, busy, ...input }: VestaTableProps) {
  const t = useTranslations();
  const vm = useVestaTable(input);
  const { state, mySeats } = input;

  return (
    <div className="space-y-3">
      <VestaBoard
        state={state}
        mode={vm.turn.mode}
        onPickVertex={vm.pickVertex}
        onPickEdge={vm.pickEdge}
        onPickHex={vm.pickHex}
      />

      <VestaPlayers state={state} mySeats={mySeats} seatLabel={seatLabel} turn={vm.turn} />
      <VestaPrompts state={state} seatLabel={seatLabel} busy={busy} turn={vm.turn} />
      <VestaTurnActions state={state} busy={busy} turn={vm.turn} />

      <VestaTradePanel state={state} seatLabel={seatLabel} busy={busy} turn={vm.turn} />

      {vm.waiting && (
        <p className="text-center text-[11px] text-lc-muted">
          {t('games.vestaTable.waitingFor', { name: seatLabel(vm.waitingFor) })}
        </p>
      )}
    </div>
  );
}
