'use client';

import { useId } from 'react';
import { useTranslations } from 'next-intl';
import Chip from '@/components/ui/Chip';
import Text from '@/components/ui/Text';
import { TIMEOUTS, localPlayerChoices } from './game-options';
import type { NewGameForm } from '@/hooks/chat/games/new-game/useNewGameForm';

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
            {selected.realtime ? 'Just me' : `${n} on this machine`}
          </Chip>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-lc-muted">
        {localPlayers === 0
          ? 'The table waits in the channel until you start it.'
          : selected.realtime
            ? 'Starts straight away, on your own. Everyone else needs their own device: every board runs at the same time.'
            : `Starts straight away with ${localPlayers} players taking turns at this keyboard.`}
      </p>

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
                {option.label}
              </Chip>
            ))}
          </div>
          {selected.type === 'vesta' && timeout > 0 && (
            <p className="mt-1 text-[10px] text-lc-muted">
              {t('games.turnClockHelp')}
            </p>
          )}
        </>
      )}
    </>
  );
}
