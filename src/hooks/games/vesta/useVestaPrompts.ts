'use client';

import type { GameState, TradeResource } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import { RESOURCES, describe, filled, sum } from '@/components/games/vesta/resources';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { withCount } from '@/utils/games/vesta/vesta-actions';

/**
 * What the rules want from this seat outside its own turn actions: the
 * discard after a seven, a trade offer to answer or withdraw, the robber,
 * and who to rob. Every move goes through the turn's `send`, so it is made
 * for the acting seat.
 */
export function useVestaPrompts({ state, busy, turn }: { state: GameState; busy?: boolean; turn: VestaTurn }) {
  const {
    participants, actingIdx, can, send, mustDiscard, myHandSize, discard, setDiscard,
    pendingTrade, iAmTradeTarget, iAmProposer, robberPending, showSteal, stealVictims, skipSteal,
  } = turn;
  const discardCount = Math.floor(myHandSize / 2);
  const discardPicked = sum(discard);
  const holding = (r: TradeResource) => state.players[actingIdx]?.resources[r] ?? 0;
  const stealAction = (victim: number, resource: TradeResource) => ({ type: 'steal-resource', victim, resource } as VestaAction);

  return {
    mustDiscard,
    discardCount,
    discardPicked,
    canDiscard: !busy && discardPicked === discardCount,
    discardCounters: RESOURCES.map((r) => ({ resource: r, value: discard[r] ?? 0, max: holding(r) })),
    setDiscardCount: (r: TradeResource, v: number) => setDiscard((d) => withCount(d, r, v)),
    submitDiscard: () => {
      void send({ type: 'discard-resources', resources: filled(discard) } as VestaAction);
      setDiscard({});
    },

    /** The offer on the table, when this seat made it or is asked to answer it. */
    offer: pendingTrade && (iAmTradeTarget || iAmProposer)
      ? { fromSeat: participants[pendingTrade.from] ?? '', give: describe(pendingTrade.give), take: describe(pendingTrade.take) }
      : null,
    iAmTradeTarget,
    iAmProposer,
    accept: () => void send({ type: 'accept-trade' } as VestaAction),
    reject: () => void send({ type: 'reject-trade' } as VestaAction),
    withdraw: () => void send({ type: 'cancel-proposal' } as VestaAction),

    robberPending,
    showSteal,
    stealVictims: stealVictims.map((victim) => ({
      victim,
      seat: participants[victim] ?? '',
      resources: RESOURCES.map((r) => ({ resource: r, enabled: !busy && can(stealAction(victim, r)) })),
    })),
    steal: (victim: number, resource: TradeResource) => void send(stealAction(victim, resource)),
    skipSteal,
  };
}
