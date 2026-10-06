'use client';

import { useRef } from 'react';
import { CR_SIZES, type CRSizeKey } from '@/lib/games/chain-reaction';
import { useTranslation } from '@/i18n/context';
import FileInput from '@/components/ui/FileInput';
import Input from '@/components/ui/Input';
import type { NewGameForm } from './useNewGameForm';
import Text from '@/components/ui/Text';
import Button from '@/components/ui/Button';

/** The chosen game's own options: board size, piece seed, or board seed and a save to resume. */
export default function GameSetupOptions({ form }: { form: NewGameForm }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const { selected, size, setSize, seed, setSeed, editVestaSeed, resume, loadSave } = form;
  if (!selected) return null;
  return (
    <>
      {selected.type === 'chain-reaction' && (
        <>
          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.board')}</Text>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(Object.keys(CR_SIZES) as CRSizeKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSize(key)}
                className={`rounded-lg border px-2 py-2 text-xs transition-colors ${
                  size === key ? 'border-lc-green text-lc-green' : 'border-lc-border text-lc-white hover:bg-lc-border/40'
                }`}
                data-testid={`game-size-${key}`}
              >
                {CR_SIZES[key].label}
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
          <p className="mt-1 text-[10px] text-lc-muted">
            {t('games.pieceSeedHelp')}
          </p>
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
          <p className="mt-1 text-[10px] text-lc-muted">
            {t('games.boardSeedHelp')}
          </p>

          <Text as="p" size="10" variant="label" tone="muted" className="mt-4">{t('games.continueSaved')}</Text>
          <FileInput
            ref={fileRef}
            accept=".json,application/json"
            aria-label={t('games.loadVesta')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadSave(file);
              e.target.value = '';
            }}
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
            <p className="mt-2 text-[11px] text-lc-green" data-testid="vesta-resume-note">
              Resuming {resume.name}: {resume.players} players. The table needs exactly that many seats.
            </p>
          )}
        </>
      )}
    </>
  );
}
