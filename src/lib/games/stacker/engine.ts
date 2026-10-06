/**
 * Stacker - the falling-block engine.
 *
 * (Named Stacker, not the obvious thing: that word is a trademark and this is
 * shipping in a product, so the genre stays and the name doesn't.)
 *
 * Deterministic by construction: the whole game is a pure function of
 * `(seed, ordered inputs)`. No wall clock, no randomness, no I/O - time enters
 * only as a frame number the caller supplies. That is what makes a match over
 * a relay both smooth and checkable:
 *
 *   - **smooth**, because each client simulates its own board locally at
 *     60 Hz and never waits for the network to draw a frame;
 *   - **checkable**, because a client publishes its input log alongside the
 *     attacks it claims, and anyone can replay that log against the shared
 *     seed and confirm the attacks were real.
 *
 * Two players on the same seed get the same pieces in the same order, so a
 * match is a fair race rather than a comparison of luck.
 *
 * The pieces (`./pieces.ts`), the well (`./board.ts`) and the attack table
 * (`./attack.ts`) are their own modules; this file is the state machine that
 * composes them, and re-exports their surface so callers have one import.
 */
import { type ActivePiece } from './pieces';
import {
  collides,
  emptyBoard,
  packBoard,
  stackHeightOf,
  MAX_GARBAGE_LINES,
  WIDTH,
} from './board';
import { lockPiece } from './lock';
import { refillQueue, spawn, tryMove, tryRotate } from './motion';
import type { GameState, Input } from './state';

export { bag, cellsOf, mulberry32, PIECES, type ActivePiece, type PieceKind, type Rotation } from './pieces';
export { attackFor, type ClearEvent } from './attack';
export {
  decodeBoard,
  emptyBoard,
  BUFFER,
  GARBAGE_CELL,
  HEIGHT,
  MAX_GARBAGE_LINES,
  TOTAL_HEIGHT,
  WIDTH,
  type Cell,
} from './board';

export type { GameState, Input, InputKind } from './state';

/* ── the engine ───────────────────────────────────────────────────────── */

export function createState(seed: number): GameState {
  const state: GameState = {
    board: emptyBoard(),
    active: null,
    hold: null,
    holdUsed: false,
    queue: [],
    bagIndex: 0,
    seed,
    frame: 0,
    linesCleared: 0,
    incoming: [],
    attacksSent: 0,
    combo: 0,
    backToBack: 0,
    dead: false,
    clears: [],
  };
  refillQueue(state);
  spawn(state);
  return state;
}


/**
 * Apply one input to the state. Pure in spirit - it mutates the state it is
 * given, and callers that need history keep their own copies (`replay` below
 * always starts from a fresh state).
 */
export function step(state: GameState, input: Input): GameState {
  if (state.dead) return state;
  state.frame = Math.max(state.frame, input.frame);

  switch (input.kind) {
    case 'left':
      tryMove(state, -1, 0);
      break;
    case 'right':
      tryMove(state, 1, 0);
      break;
    case 'cw':
      tryRotate(state, 1);
      break;
    case 'ccw':
      tryRotate(state, 3);
      break;
    case 'flip':
      tryRotate(state, 2);
      break;
    case 'soft':
      tryMove(state, 0, 1);
      break;
    case 'gravity':
      if (!tryMove(state, 0, 1)) lockPiece(state, false);
      break;
    case 'hard': {
      while (tryMove(state, 0, 1)) { /* fall to the floor */ }
      lockPiece(state, false);
      break;
    }
    case 'hold': {
      if (state.holdUsed || !state.active) break;
      const current = state.active.kind;
      const swap = state.hold;
      state.hold = current;
      spawn(state, swap ?? undefined);
      state.holdUsed = true;
      break;
    }
    case 'garbage': {
      const raw = input.lines ?? 0;
      // `Infinity` floors to itself and would loop `applyGarbage` forever.
      const lines = Number.isFinite(raw) ? Math.min(MAX_GARBAGE_LINES, Math.max(0, Math.floor(raw))) : 0;
      if (lines > 0) {
        const hole = Number.isFinite(input.hole ?? 0) ? Math.abs(Math.floor(input.hole ?? 0)) % WIDTH : 0;
        state.incoming.push({ lines, hole });
      }
      break;
    }
  }
  return state;
}

/**
 * Rebuild a board from nothing but the seed and the inputs.
 *
 * This is the honest-play check: a player publishes their input log with the
 * attacks they claim, and anyone can run this and see whether those attacks
 * actually happened. It is also how the local client recovers from a reload.
 */
export function replay(seed: number, inputs: readonly Input[]): GameState {
  const state = createState(seed);
  for (const input of inputs) step(state, input);
  return state;
}

/** Total attack a log actually produces - what a claim gets measured against. */
export function attackFromLog(seed: number, inputs: readonly Input[]): number {
  return replay(seed, inputs).attacksSent;
}

/** Height of the tallest column, for the danger meter and mini-boards. */
export function stackHeight(state: GameState): number {
  return stackHeightOf(state.board);
}

/**
 * Can the active piece still fall? The loop needs this to implement lock
 * delay: a piece that has landed gets a moment to slide before it cements,
 * which is the difference between this feeling right and feeling stiff.
 */
export function canFall(state: GameState): boolean {
  if (!state.active) return false;
  return !collides(state.board, { ...state.active, y: state.active.y + 1 });
}

/** The visible well as one hex digit per cell. See `packBoard`. */
export function encodeBoard(state: GameState): string {
  return packBoard(state.board);
}

/** Where the active piece would land - the ghost. */
export function ghostOf(state: GameState): ActivePiece | null {
  if (!state.active) return null;
  let ghost = state.active;
  for (;;) {
    const next = { ...ghost, y: ghost.y + 1 };
    if (collides(state.board, next)) return ghost;
    ghost = next;
  }
}
