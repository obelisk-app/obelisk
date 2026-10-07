'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import Chip from '@/components/ui/data/Chip';
import Text from '@/components/ui/layout/Text';
import { TIMEOUTS, localPlayerChoices } from '@/utils/games/new-game/game-options';
import type { NewGameForm } from '@/hooks/games/new-game/useNewGameForm';

/** Who plays (people in the channel, or N on this machine) and the turn clock. */
export default function PlayersAndClock({ form }: { form: NewGameForm }) {
  const t = useTranslations();
  const whoId = useId();
  const clockId = useId();
  const { selected, localPlayers, setLocalPlayers, timeout, setTimeoutS } = form;
  if (!selected) return null;
  return (
    <>
      <Text as="p" id={whoId} size="10" variant="label" tone="muted" className="mt-4">{t('games.whoPlays')}</Text>
      <div role="radiogroup" aria-labelledby={whoId} className="mt-1 flex flex-wrap gap-2">
        <Chip
          behavior="radio"
          state={localPlayers === 0 ? 'selected' : 'idle'}
          onClick={() => setLocalPlayers(0)}
          data-testid="players-online"
        >
          {t('games.peopleHere')}
        </Chip>
        {localPlayerChoices(selected).map((n) => (
          <Chip
            key={n}
            behavior="radio"
            state={localPlayers === n ? 'selected' : 'idle'}
            onClick={() => setLocalPlayers(n)}
            data-testid={`players-local-${n}`}
          >
            {selected.realtime ? t('games.newGame.justMe') : t('games.newGame.onThisMachine', { count: n })}
          </Chip>
        ))}
      </div>
      <Text as="p" size="10" tone="muted" className="mt-1">
        {localPlayers === 0
          ? t('games.newGame.waitsInChannel')
          : selected.realtime
            ? t('games.newGame.startsSolo')
            : t('games.newGame.startsHotSeat', { count: localPlayers })}
      </Text>

      {selected.type !== 'stacker' && (
        <>
          <Text as="p" id={clockId} size="10" variant="label" tone="muted" className="mt-4">{t('games.turnClock')}</Text>
          <div role="radiogroup" aria-labelledby={clockId} className="mt-1 flex flex-wrap gap-2">
            {TIMEOUTS.map((option) => (
              <Chip
                key={option.seconds}
                behavior="radio"
                state={timeout === option.seconds ? 'selected' : 'idle'}
                onClick={() => setTimeoutS(option.seconds)}
              >
                {option.label ?? t('games.newGame.noClock')}
              </Chip>
            ))}
          </div>
          {selected.type === 'vesta' && timeout > 0 && (
            <Text as="p" size="10" tone="muted" className="mt-1">
              {t('games.turnClockHelp')}
            </Text>
          )}
        </>
      )}
    </>
  );
}
