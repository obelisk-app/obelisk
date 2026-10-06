'use client';

import { useState } from 'react';
import type { CRSizeKey } from '@/lib/games/chain-reaction';
import { readResumeState, playerCountOf } from '@/lib/games/vesta/definition';
import type { GameInfo } from '@/lib/games/catalog';
import { publishCreate, publishStart } from '@/services/games/transport';
import { localSeatId, gameMarker } from '@/lib/games/protocol';
import { useGamesStore } from '@/store/games';
import { useMyPubkey } from '@/services/nostr-bridge';
import { gameCreateOptions, type ResumeSave } from '@/components/chat/games/new-game/game-options';

/**
 * The new-table form: which game, its options, who plays and the clock, and
 * the two publishes that open it. `create` publishes the `create` event, seats
 * and starts a local table in the same breath, posts the channel marker and
 * opens the table.
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
  const [selected, setSelected] = useState<GameInfo | null>(null);
  const [size, setSize] = useState<CRSizeKey>('medium');
  const [seed, setSeed] = useState(() => String(Math.floor(Date.now() / 1000) % 100000));
  const [resume, setResume] = useState<ResumeSave | null>(null);
  const [timeout, setTimeoutS] = useState(0);
  // 0 = a table other people join. Anything else opens and starts immediately
  // with that many players sharing this keyboard.
  const [localPlayers, setLocalPlayers] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setOpenGame = useGamesStore((s) => s.setOpenGame);
  const myPubkey = useMyPubkey();

  function choose(info: GameInfo) {
    setSelected(info);
    setResume(null);
    setError(null);
    // Each game brings its own sane clock: Chain Reaction is one click a turn,
    // a Vesta turn is a whole sequence of decisions.
    setTimeoutS(info.defaultTurnTimeoutS);
    setLocalPlayers(0);
  }

  async function loadSave(file: File) {
    setError(null);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const state = readResumeState(parsed);
      if (!state) {
        setError('That file is not a Vesta save.');
        return;
      }
      setResume({ data: parsed, players: playerCountOf(parsed) ?? state.players.length, name: file.name });
    } catch {
      setError('Could not read that file.');
    }
  }

  async function create() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const opts = gameCreateOptions(selected.type, { resume, seed, size });
      // The game published is the game selected: the whole table hangs off
      // this one string, so it comes straight from the chosen catalog entry.
      const gameId = await publishCreate(channelId, {
        game: selected.type,
        opts,
        turnTimeoutS: timeout,
      });

      // A table played on this machine has nobody to wait for: seat everyone
      // on the host's key and start it in the same breath. The seats are still
      // separate players: same rules, same events, one keyboard.
      if (localPlayers > 0 && myPubkey) {
        await publishStart(channelId, gameId, Array.from({ length: localPlayers }, (_, i) => ({
          id: localSeatId(myPubkey, i),
          by: myPubkey,
          label: `Player ${i + 1}`,
        })));
      }

      onPostMarker(gameMarker(gameId));
      setOpenGame(gameId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the table');
      setBusy(false);
    }
  }

  // Typing a seed starts a fresh board, so it drops a loaded save.
  const editVestaSeed = (value: string) => { setSeed(value); setResume(null); };

  return {
    selected, setSelected, choose,
    size, setSize,
    seed, setSeed, editVestaSeed,
    resume, loadSave,
    timeout, setTimeoutS,
    localPlayers, setLocalPlayers,
    busy, error, create,
  };
}

export type NewGameForm = ReturnType<typeof useNewGameForm>;
