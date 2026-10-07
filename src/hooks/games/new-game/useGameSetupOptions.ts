'use client';

import type { ChangeEvent } from 'react';
import { CR_SIZES, type CRSizeKey } from '@/lib/games/chain-reaction/chain-reaction';
import type { NewGameForm } from '@/hooks/games/new-game/useNewGameForm';

/** Board sizes in the order the engine lists them. */
const SIZE_KEYS = Object.keys(CR_SIZES) as CRSizeKey[];

/**
 * The chosen game's options: the form's own fields, the Chain Reaction sizes,
 * and `pickSave`, which hands a chosen save file to the form and clears the
 * input so the same file can be picked again.
 */
export function useGameSetupOptions(form: NewGameForm) {
  const pickSave = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void form.loadSave(file);
    e.target.value = '';
  };
  return { ...form, sizes: SIZE_KEYS, pickSave };
}
