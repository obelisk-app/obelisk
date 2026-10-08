'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CRSizeKey } from '@/lib/games/chain-reaction/chain-reaction';
import { readResumeState, playerCountOf } from '@/lib/games/vesta/resume';
import type { GameInfo } from '@/lib/games/core/catalog';
import { useMyPubkey } from '@/services/nostr-bridge';
import { newGameForm } from '@/services/games/new-game-form';
import { useForm } from '@/hooks/common/useForm';

/**
 * The new-table form: the common form over `newGameForm` (its options, who
 * plays, the clock, and the publishes that open the table), plus the two
 * steps it is shown in. It stays a hook because picking a game resets the
 * options to that game's own defaults, and a Vesta save file is read and
 * checked here before it becomes a value.
 */
export function useNewGameForm({
  channelId,
  onClose,
  onPostMarker,
}: {
  channelId: string;
  onClose: () => void;
  onPostMarker: (marker: string) => void;
}) {
  const t = useTranslations();
  const [selected, setSelected] = useState<GameInfo | null>(null);
  const myPubkey = useMyPubkey();
  const form = useForm(newGameForm({
    channelId, selected, myPubkey, onPostMarker, onClose,
    playerLabel: (n) => t('games.newGame.player', { n }),
  }));
  const { values } = form;

  function choose(info: GameInfo) {
    setSelected(info);
    form.setError(null);
    // Each game brings its own sane clock: Chain Reaction is one click a turn,
    // a Vesta turn is a whole sequence of decisions.
    form.setValues({ resume: null, timeout: info.defaultTurnTimeoutS, localPlayers: 0 });
  }

  async function loadSave(file: File) {
    form.setError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const state = readResumeState(parsed);
      if (!state) {
        form.setError(t('games.newGame.notVestaSave'));
        return;
      }
      form.set('resume', { data: parsed, players: playerCountOf(parsed) ?? state.players.length, name: file.name });
    } catch {
      form.setError(t('games.newGame.readFailed'));
    }
  }

  return {
    selected, setSelected, choose,
    size: values.size, setSize: (value: CRSizeKey) => form.set('size', value),
    seed: values.seed, setSeed: (value: string) => form.set('seed', value),
    // Typing a seed starts a fresh board, so it drops a loaded save.
    editVestaSeed: (value: string) => form.setValues({ seed: value, resume: null }),
    resume: values.resume, loadSave,
    timeout: values.timeout, setTimeoutS: (value: number) => form.set('timeout', value),
    localPlayers: values.localPlayers, setLocalPlayers: (value: number) => form.set('localPlayers', value),
    busy: form.submitting, error: form.error, create: () => void form.submit(),
  };
}

export type NewGameForm = ReturnType<typeof useNewGameForm>;
