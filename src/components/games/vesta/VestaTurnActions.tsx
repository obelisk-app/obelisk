'use client';

import type { GameState } from 'vesta';
import { useTranslations } from 'next-intl';
import ActionButton from './ActionButton';
import ModeToggle from './ModeToggle';
import type { VestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { useVestaTurnActions } from '@/hooks/games/vesta/useVestaTurnActions';
import Button from '@/components/ui/buttons/Button';

/** Roll, build modes, development card, end turn; then the development cards in hand. */
export default function VestaTurnActions({ state, busy, turn }: {
  state: GameState;
  busy?: boolean;
  turn: VestaTurn;
}) {
  const t = useTranslations();
  const vm = useVestaTurnActions({ state, busy, turn });
  return (
    <>
      {/* Turn actions */}
      {vm.showActions && (
        <div className="flex flex-wrap gap-2" data-testid="vesta-actions">
          <ActionButton label={t('games.vesta.roll')} enabled={vm.canRoll} onClick={vm.roll} />
          <ModeToggle label={t('games.vesta.settlement')} active={vm.pick === 'settlement'} enabled={vm.canBuild} onClick={() => vm.togglePick('settlement')} />
          <ModeToggle label={t('games.vesta.road')} active={vm.pick === 'road'} enabled={vm.canBuild} onClick={() => vm.togglePick('road')} />
          <ModeToggle label={t('games.vesta.city')} active={vm.pick === 'city'} enabled={vm.canBuild} onClick={() => vm.togglePick('city')} />
          <ActionButton label={t('games.vesta.devCard')} enabled={vm.canBuyDevCard} onClick={vm.buyDevCard} />
          <ActionButton label={t('games.vesta.endTurn')} enabled={vm.canEndTurn} onClick={vm.endTurn} />
        </div>
      )}

      {/* Development cards in hand */}
      {vm.hand.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="vesta-hand">
          {vm.hand.map((card) => (
            <Button
              variant="outlinePill"
              size="xs"
              key={card.key}
              disabled={!card.enabled}
              onClick={() => vm.playCard(card.cardType)}
            >
              {card.emoji}{' '}
              {card.label}
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
