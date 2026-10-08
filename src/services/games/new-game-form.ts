import type { CRSizeKey } from '@/lib/games/chain-reaction/chain-reaction';
import type { GameInfo } from '@/lib/games/core/catalog';
import { gameMarker, localSeatId } from '@/lib/games/protocol/protocol';
import { publishCreate, publishStart } from '@/services/games/transport';
import { useGamesStore } from '@/store/games';
import type { FormSpec } from '@/constants/common/form';
import { gameCreateOptions, type ResumeSave } from '@/utils/games/new-game/game-options';

export type NewGameValues = {
  size: CRSizeKey;
  seed: string;
  /** A Vesta save to resume from, loaded from a file. */
  resume: ResumeSave | null;
  /** The turn clock in seconds, 0 for none. */
  timeout: number;
  /**
   * 0 is a table other people join. Anything else opens and starts at once
   * with that many players sharing this keyboard.
   */
  localPlayers: number;
};

export interface NewGameTarget {
  channelId: string;
  /** The game picked in the list; nothing is sent before one is. */
  selected: GameInfo | null;
  myPubkey: string | null;
  /** The name of local seat `n` (1-based), in the reader's language. */
  playerLabel: (n: number) => string;
  onPostMarker: (marker: string) => void;
  onClose: () => void;
}

/** A fresh table's starting values: a seed from the clock, no clock, a table others join. */
export function newGameValues(): NewGameValues {
  return { size: 'medium', seed: String(Math.floor(Date.now() / 1000) % 100000), resume: null, timeout: 0, localPlayers: 0 };
}

/**
 * Opening a game table (`NewGameModal`): publishes the `create` event for
 * the picked game with its options; a table played on this machine is seated
 * on the host's key and started in the same breath (the seats are still
 * separate players: same rules, same events, one keyboard). Then the channel
 * card's marker is posted and the table opened.
 */
export function newGameForm(target: NewGameTarget): FormSpec<NewGameValues, string> {
  return {
    initial: newGameValues,
    ready: () => target.selected !== null,
    submit: async (values) => {
      const game = target.selected as GameInfo;
      // The game published is the game selected: the whole table hangs off
      // this one string, so it comes straight from the chosen catalog entry.
      const gameId = await publishCreate(target.channelId, {
        game: game.type,
        opts: gameCreateOptions(game.type, { resume: values.resume, seed: values.seed, size: values.size }),
        turnTimeoutS: values.timeout,
      });
      const me = target.myPubkey;
      if (values.localPlayers > 0 && me) {
        await publishStart(target.channelId, gameId, Array.from({ length: values.localPlayers }, (_, i) => ({
          id: localSeatId(me, i),
          by: me,
          label: target.playerLabel(i + 1),
        })));
      }
      return gameId;
    },
    failure: 'games.newGame.createFailed',
    onSuccess: (gameId) => {
      target.onPostMarker(gameMarker(gameId));
      useGamesStore.getState().setOpenGame(gameId);
      target.onClose();
    },
  };
}
