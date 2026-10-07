'use client';

import { useRef } from 'react';
import { CR_SIZES } from '@/lib/games/chain-reaction/chain-reaction';
import { useTranslations } from 'next-intl';
import FileInput from '@/components/ui/forms/FileInput';
import Input from '@/components/ui/forms/Input';
import type { NewGameForm } from '@/hooks/games/new-game/useNewGameForm';
import { useGameSetupOptions } from '@/hooks/games/new-game/useGameSetupOptions';
import Text from '@/components/ui/layout/Text';
import Button from '@/components/ui/buttons/Button';

/** The chosen game's own options: board size, piece seed, or board seed and a save to resume. */
export default function GameSetupOptions({ form }: { form: NewGameForm }) {
  const t = useTranslations();
  const fileRef = useRef<HTMLInputElement>(null);
  const { selected, size, setSize, seed, setSeed, editVestaSeed, resume, sizes, pickSave } = useGameSetupOptions(form);
  if (!selected) return null;
  return (
    <>
      {selected.type === 'chain-reaction' && (
        <>
          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.board')}</Text>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {sizes.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSize(key)}
                className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                  size === key ? 'border-lc-green text-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'
                }`}
                data-testid={`game-size-${key}`}
              >
                {t(`games.size.${key}`, { cols: CR_SIZES[key].cols, rows: CR_SIZES[key].rows })}
              </button>
            ))}
          </div>
        </>
      )}

      {selected.type === 'stacker' && (
        <>
          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.pieceSeed')}</Text>
          <Input
            variant="ghost"
            size="xs"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            className="mt-1"
            aria-label={t('games.pieceSeed')}
            data-testid="stacker-seed"
          />
          <Text as="p" size="10" tone="muted" className="mt-1">
            {t('games.pieceSeedHelp')}
          </Text>
        </>
      )}

      {selected.type === 'vesta' && (
        <>
          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.boardSeed')}</Text>
          <Input
            variant="ghost"
            size="xs"
            value={seed}
            onChange={(e) => editVestaSeed(e.target.value)}
            disabled={!!resume}
            className="mt-1"
            aria-label={t('games.boardSeed')}
            data-testid="vesta-seed"
          />
          <Text as="p" size="10" tone="muted" className="mt-1">
            {t('games.boardSeedHelp')}
          </Text>

          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.continueSaved')}</Text>
          <FileInput
            ref={fileRef}
            accept=".json,application/json"
            aria-label={t('games.loadVesta')}
            onChange={pickSave}
            data-testid="vesta-import-input"
          />
          <Button
            variant="outlinePill"
            size="xs"
            onClick={() => fileRef.current?.click()} className="mt-1"
            data-testid="vesta-import"
          >
            {t('games.loadVesta')}
          </Button>
          {resume && (
            <Text as="p" size="11" tone="accent" className="mt-2" data-testid="vesta-resume-note">
              {t('games.newGame.resuming', { name: resume.name, count: resume.players })}
            </Text>
          )}
        </>
      )}
    </>
  );
}
