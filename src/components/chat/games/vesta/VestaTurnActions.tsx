'use client';

import type { GameState } from 'vesta';
import type { VestaAction } from '@/lib/games/vesta/definition';
import { useTranslations } from 'next-intl';
import { DEV_EMOJI } from './resources';
import { ActionButton as Action, ModeToggle as Toggle } from './table-controls';
import type { VestaTurn } from '@/hooks/chat/games/vesta/useVestaTurn';
import Button from '@/components/ui/Button';

/** Roll, build modes, development card, end turn; then the development cards in hand. */
export default function VestaTurnActions({ state, busy, turn }: {
  state: GameState;
  busy?: boolean;
  turn: VestaTurn;
}) {
  const t = useTranslations();
  const { myTurn, isSetup, actingIdx, can, send, pick, setPick } = turn;
  return (
    <>
      {/* Turn actions */}
      {myTurn && state.winner === null && !isSetup && (
        <div className="flex flex-wrap gap-2" data-testid="vesta-actions">
          <Action label={t('games.vesta.roll')} enabled={!busy && can({ type: 'roll-dice' } as VestaAction)} onClick={() => void send({ type: 'roll-dice' } as VestaAction)} />
          <Toggle label={t('games.vesta.settlement')} active={pick === 'settlement'} enabled={!busy && state.rolled} onClick={() => setPick(pick === 'settlement' ? 'none' : 'settlement')} />
          <Toggle label={t('games.vesta.road')} active={pick === 'road'} enabled={!busy && state.rolled} onClick={() => setPick(pick === 'road' ? 'none' : 'road')} />
          <Toggle label={t('games.vesta.city')} active={pick === 'city'} enabled={!busy && state.rolled} onClick={() => setPick(pick === 'city' ? 'none' : 'city')} />
          <Action label={t('games.vesta.devCard')} enabled={!busy && can({ type: 'buy-dev-card' } as VestaAction)} onClick={() => void send({ type: 'buy-dev-card' } as VestaAction)} />
          <Action label={t('games.vesta.endTurn')} enabled={!busy && can({ type: 'end-turn' } as VestaAction)} onClick={() => void send({ type: 'end-turn' } as VestaAction)} />
        </div>
      )}

      {/* Development cards in hand */}
      {actingIdx >= 0 && (state.players[actingIdx]?.hand.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="vesta-hand">
          {state.players[actingIdx]!.hand.map((card, i) => (
            <Button
              variant="outlinePill"
              size="xs"
              key={`${card.cardType}-${i}`}
              disabled={busy || !myTurn || !card.available || !can({ type: 'play-dev-card', cardType: card.cardType } as VestaAction)}
              onClick={() => void send({ type: 'play-dev-card', cardType: card.cardType } as VestaAction)}
            >
              {DEV_EMOJI[card.cardType] ?? '🎴'} {card.cardType}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
