'use client';

import type { GameState, TradeResource } from 'vesta';
import { tradeAction } from '@/utils/games/vesta/resources';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { withCount } from '@/utils/games/vesta/vesta-actions';
import { bankRatesText, tradePartners } from '@/utils/games/vesta/vesta-trade';

/**
 * The trade panel: open on this seat's turn once the dice are rolled, outside
 * setup and before a winner. Trade with the bank at this seat's rates, or
 * offer a trade to another player; the offer is enabled only when the engine
 * would take it.
 *
 * `give` and `take` arrive already within their caps (`useCappedDraft` in the
 * turn), so the counts shown, the offer checked and the offer sent are the
 * same corrected draft.
 */
export function useVestaTradePanel({ state, busy, turn }: { state: GameState; busy?: boolean; turn: VestaTurn }) {
  const {
    myTurn, isSetup, participants, actingIdx, can, send, rates,
    tradePartner, setTradePartner, give, setGive, take, setTake, holding, takeCap,
  } = turn;

  const submit = () => {
    if (tradePartner === null) return;
    void send(tradeAction(tradePartner, give, take));
    setGive({});
    setTake({});
  };

  return {
    visible: myTurn && state.rolled && !isSetup && state.winner === null,
    partners: tradePartners(participants, actingIdx),
    partner: tradePartner,
    choosePartner: (partner: number | 'bank') => setTradePartner(partner),
    give,
    take,
    setGiveCount: (r: TradeResource, v: number) => setGive((cur) => withCount(cur, r, v)),
    setTakeCount: (r: TradeResource, v: number) => setTake((cur) => withCount(cur, r, v)),
    giveMax: holding,
    takeMax: takeCap,
    isBank: tradePartner === 'bank',
    bankRates: rates && tradePartner === 'bank' ? bankRatesText(rates) : null,
    canSubmit: !busy && tradePartner !== null && can(tradeAction(tradePartner, give, take)),
    submit,
  };
}
