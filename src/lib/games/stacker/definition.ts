/**
 * Stacker as an Obelisk game.
 *
 * The turn-based hooks below are deliberately inert: a real-time game has no
 * seat "to move", so `deriveSession` routes past them the moment it sees
 * `realtime: true`, and the match lives in `session.match` instead of
 * `session.state`. What this definition really contributes is the player
 * limits and the match reducer (`./match.ts`) that replay runs instead.
 */
import type { ApplyResult, GameDefinition } from '../types';
import { STACKER_META } from '../game-meta';
import { applyMatchEvent, initialMatch } from './match';

export const STACKER_MIN_PLAYERS = STACKER_META.minPlayers;
export const STACKER_MAX_PLAYERS = STACKER_META.maxPlayers;

/** How the attack picks its victim when more than one opponent is standing. */
export type TargetMode = 'random' | 'badges' | 'attackers';

export const stacker: GameDefinition<null, never> = {
  // Name, limits, `realtime: true` and no turn clock: see STACKER_META.
  ...STACKER_META,
  match: { initialMatch, applyMatchEvent },

  initialState: () => null,
  firstTurn: (participants) => participants[0],
  validateAction: () => ({ ok: false, error: 'Stacker is played in real time' }),
  applyAction: (state): ApplyResult<null> => ({ state, nextTurn: null }),
  onTimeout: (state): ApplyResult<null> => ({ state, nextTurn: null }),
};
