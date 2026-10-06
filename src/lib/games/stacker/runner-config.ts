/**
 * How a Stacker run feels and what it reports: frame timing, key repeat, the
 * gravity curve, lock delay, the default keys, and the shapes the runner
 * hands its listeners. Re-exported from `runner.ts`.
 */
import type { InputKind } from './engine';

export const FRAME_MS = 1000 / 60;
/** Frames a held key waits before it starts repeating. */
export const DAS_FRAMES = 10;
/** Frames between repeats once it does. */
export const ARR_FRAMES = 2;
/**
 * Frames between gravity steps, by level. Ten lines is a level.
 *
 * The old formula stepped 48 → 4 in flat blocks of four frames, which meant
 * the first hundred lines barely changed pace and then it fell off a cliff.
 * This is the classic curve instead: gentle at the start, sharply faster
 * through the teens, and a hard floor so it stays humanly playable.
 */
export const GRAVITY_BY_LEVEL = [
  48, 43, 38, 33, 28, 23, 18, 13, 8, 6,
  5, 5, 5, 4, 4, 4, 3, 3, 3, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 1,
];

/** Ten lines to a level. */
export const LINES_PER_LEVEL = 10;

/** Gravity interval at level 0, in frames. Kept for callers that want it. */
export const BASE_GRAVITY_FRAMES = GRAVITY_BY_LEVEL[0];

/** The level a line count has reached. */
export function levelFor(lines: number): number {
  return Math.floor(lines / LINES_PER_LEVEL);
}

/** Frames between gravity steps at this line count. */
export function gravityFramesFor(lines: number): number {
  const level = levelFor(lines);
  return GRAVITY_BY_LEVEL[Math.min(level, GRAVITY_BY_LEVEL.length - 1)];
}
/** Grace a landed piece gets before it cements. */
export const LOCK_DELAY_FRAMES = 30;
/** How many slides may refresh that grace. */
export const LOCK_RESETS = 15;
/** How often the readable numbers are pushed to React. */
export const STATS_INTERVAL_MS = 120;
/** How often queued attacks and checkpoints leave. */
export const FLUSH_INTERVAL_MS = 250;
/**
 * How often a snapshot of the well goes out so opponents can watch.
 *
 * Separate from the verification checkpoint, which carries the whole input log
 * and only needs to be occasional. A board is 200 characters, so it can travel
 * often enough to be worth looking at without flooding the relay.
 */
export const BOARD_INTERVAL_FRAMES = 180;

export interface StackerStats {
  linesCleared: number;
  attacksSent: number;
  incoming: number;
  combo: number;
  backToBack: number;
  stackHeight: number;
  /** Ten lines to a level; drives how fast pieces fall. */
  level: number;
  dead: boolean;
  frame: number;
  /** Most recent clear, for the banner. Cleared after a moment. */
  lastClear: { lines: number; spin: boolean; attack: number; at: number } | null;
}

export interface StackerRunnerOptions {
  seed: number;
  onAttack: (lines: number, hole: number, nonce: number) => void;
  onCheckpoint: (payload: {
    frame: number;
    attacksSent: number;
    linesCleared: number;
    stackHeight: number;
    inputs?: string;
    board: string;
  }) => void;
  onTopOut: () => void;
  /** Fired for sound: one per meaningful event, on the frame it happened. */
  onEvent?: (event: StackerSoundEvent) => void;
}

export type StackerSoundEvent =
  | { kind: 'move' } | { kind: 'rotate' } | { kind: 'hold' } | { kind: 'drop' }
  | { kind: 'lock' } | { kind: 'garbage'; lines: number } | { kind: 'topout' }
  | { kind: 'clear'; lines: number; spin: boolean; combo: number };

export const DEFAULT_STACKER_KEYS: Record<string, InputKind> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowDown: 'soft',
  ArrowUp: 'cw',
  KeyX: 'cw',
  KeyZ: 'ccw',
  KeyA: 'flip',
  Space: 'hard',
  KeyC: 'hold',
  ShiftLeft: 'hold',
};

/** Kept for callers that just want the defaults. */
export const STACKER_KEYS = DEFAULT_STACKER_KEYS;
