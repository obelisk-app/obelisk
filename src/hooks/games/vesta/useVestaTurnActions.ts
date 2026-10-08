'use client';

import { useTranslations } from 'next-intl';
import type { GameState } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import type { PickMode } from '@/types/games/vesta/pick-mode';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { togglePickMode } from '@/utils/games/vesta/vesta-actions';
import { handCards } from '@/utils/games/vesta/vesta-hand';

/**
 * The turn's own actions (roll, the three build modes, buy a development
 * card, end the turn) and the development cards in hand. Each is enabled
 * only when the engine's `validateAction` would take it.
 */
export function useVestaTurnActions({ state, busy, turn }: { state: GameState; busy?: boolean; turn: VestaTurn }) {
  const t = useTranslations();
  const { myTurn, isSetup, actingIdx, can, send, pick, setPick } = turn;
  const allowed = (action: VestaAction) => !busy && can(action);
  const hand = actingIdx >= 0 ? (state.players[actingIdx]?.hand ?? []) : [];

  return {
    showActions: myTurn && state.winner === null && !isSetup,
    canRoll: allowed({ type: 'roll-dice' } as VestaAction),
    roll: () => void send({ type: 'roll-dice' } as VestaAction),
    canBuild: !busy && state.rolled,
    pick,
    togglePick: (mode: PickMode) => setPick(togglePickMode(pick, mode)),
    canBuyDevCard: allowed({ type: 'buy-dev-card' } as VestaAction),
    buyDevCard: () => void send({ type: 'buy-dev-card' } as VestaAction),
    canEndTurn: allowed({ type: 'end-turn' } as VestaAction),
    endTurn: () => void send({ type: 'end-turn' } as VestaAction),
    hand: handCards(hand).map((card) => ({
      ...card,
      label: card.labelKey ? t(card.labelKey) : card.cardType,
      enabled: !busy && myTurn && card.available && can({ type: 'play-dev-card', cardType: card.cardType } as VestaAction),
    })),
    playCard: (cardType: string) => void send({ type: 'play-dev-card', cardType } as VestaAction),
  };
}
