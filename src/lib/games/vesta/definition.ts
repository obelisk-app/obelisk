/**
 * Vesta (fchurca/vesta) as an Obelisk game engine.
 *
 * The rules are NOT reimplemented here. `vesta` is a tracked dependency
 * (`github:fchurca/vesta#semver:^0`) whose core module is already pure  - 
 * `createGame(seed)` builds a deterministic board, `applyMove(state, move)`
 * returns the next state - which is exactly the contract in `../types.ts`.
 * Upgrading the game is `npm update vesta`; nothing in this file encodes a
 * rule, only the translation between their vocabulary and ours:
 *
 *   theirs                          ours
 *   ──────                          ────
 *   player index (0..n-1)           seat id (a string; see protocol.ts)
 *   move.player                     injected from the acting seat
 *   move.dice on `roll-dice`        derived from the log (see ./dice.ts)
 *   state.currentPlayer             currentTurn
 *   state.winner                    winner
 *
 * The one rule we do impose: a move never gets to name its own player. The
 * seat comes from who signed the event, so a client cannot publish a move
 * "as" somebody else - upstream's hot-seat client had no reason to care,
 * because everyone shared a keyboard.
 */
import { applyMove, createGame, type GameState } from 'vesta';
import type { ApplyResult, GameDefinition } from '../types';
import { seatIndex, toMove, type VestaAction } from './moves';
import { dryRun } from './rules';
import { sequence } from './sequence';

export type { VestaAction } from './moves';
export { isRobberPending, isStealPending } from './sequence';

export const VESTA_MIN_PLAYERS = 2;
export const VESTA_MAX_PLAYERS = 4;

/** Board seeds are chosen by the host; keep them small and human-quotable. */
export function normalizeSeed(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(Math.abs(raw)) % 1_000_000;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.floor(Math.abs(n)) % 1_000_000;
  }
  return 0;
}


/**
 * Resume a saved game. Upstream's export is `{startState, turns, endState}`;
 * we take `endState` because a table that resumes a save continues from where
 * the save stopped, and the turns before it are already baked into it.
 */
function stateFromOpts(opts: unknown, participants: string[]): GameState {
  const o = (opts ?? {}) as { resume?: unknown; seed?: unknown; title?: unknown };
  const resumed = readResumeState(o.resume);
  if (resumed) return resumed;
  return createGame({
    players: participants.length,
    roll: normalizeSeed(o.seed),
    ...(typeof o.title === 'string' ? { title: o.title } : {}),
  });
}

/** Accept either a bare GameState or a full `{endState}` record. */
export function readResumeState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = 'endState' in (raw as Record<string, unknown>)
    ? (raw as { endState: unknown }).endState
    : 'startState' in (raw as Record<string, unknown>)
      ? (raw as { startState: unknown }).startState
      : raw;
  if (!candidate || typeof candidate !== 'object') return null;
  const s = candidate as Partial<GameState>;
  if (!s.board || !Array.isArray(s.players) || typeof s.currentPlayer !== 'number') return null;
  return s as GameState;
}

/** How many seats a saved game expects. Used to size the table on import. */
export function playerCountOf(resume: unknown): number | null {
  const state = readResumeState(resume);
  return state ? state.players.length : null;
}

function result(state: GameState, participants: string[]): ApplyResult<GameState> {
  if (state.winner !== null && state.winner !== undefined) {
    return { state, nextTurn: null, winner: participants[state.winner] ?? null };
  }
  return { state, nextTurn: participants[state.currentPlayer] ?? null };
}

export const vesta: GameDefinition<GameState, VestaAction> = {
  type: 'vesta',
  displayName: 'Vesta',
  description: 'Expanding Settlements Through Accord: build, trade, and take the board. 2–4 players.',
  minPlayers: VESTA_MIN_PLAYERS,
  maxPlayers: VESTA_MAX_PLAYERS,
  // No clock by default. Our clock is per ACTION, and a Vesta turn is many
  // actions (roll, build, trade, end) - a short timer would guillotine people
  // mid-thought. Hosts who want one should pick something generous.
  defaultTurnTimeoutS: 0,

  initialState(participants, opts) {
    return stateFromOpts(opts, participants);
  },

  firstTurn(participants) {
    return participants[0];
  },

  validateAction(state, action, actorSeat, participants) {
    if (!action || typeof action !== 'object' || typeof action.type !== 'string') {
      return { ok: false, error: 'Malformed move' };
    }
    if (state.winner !== null && state.winner !== undefined) {
      return { ok: false, error: 'Game is over' };
    }
    // A dry run is the honest validator: upstream throws on anything illegal,
    // and it is pure, so running it costs us one discarded object.
    return dryRun(state, action, actorSeat, participants);
  },

  applyAction(state, action, actorSeat, participants, ctx) {
    const idx = seatIndex(participants, actorSeat);
    const next = sequence(applyMove(state, toMove(action, idx, ctx)), state, action, idx);
    return result(next, participants);
  },

  /**
   * Blowing the clock (or resigning) ends that seat's turn - it does not
   * remove the player. Vesta has no elimination: a settlement on the board
   * keeps producing whether or not its owner is paying attention, and
   * deleting a player mid-game would rewrite everyone else's board.
   */
  onTimeout(state, timedOutSeat, participants) {
    const idx = seatIndex(participants, timedOutSeat);
    if (idx < 0 || state.currentPlayer !== idx) return result(state, participants);
    try {
      return result(applyMove(state, { type: 'end-turn', player: idx }), participants);
    } catch {
      return result(state, participants);
    }
  },

  /**
   * Out-of-turn actions Vesta genuinely has: answering a trade offer, and
   * discarding when a seven is rolled. Everything else waits its turn.
   */
  canAct(state, seat, action, participants) {
    if (!action || typeof action !== 'object') return false;
    const idx = seatIndex(participants, seat);
    if (idx < 0) return false;
    switch (action.type) {
      case 'accept-trade':
      case 'reject-trade':
        return state.pendingTrade?.to === idx;
      case 'cancel-proposal':
        return state.pendingTrade?.from === idx;
      case 'discard-resources':
        // A seven hits every over-full hand at once, whoever's turn it is.
        return state.dice !== null && state.dice[0] + state.dice[1] === 7;
      default:
        return false;
    }
  },
};
