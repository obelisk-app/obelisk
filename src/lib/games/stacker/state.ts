/**
 * Stacker state and input shapes. Re-exported from `engine.ts`.
 */
import type { ActivePiece, PieceKind } from './pieces';
import type { ClearEvent } from './attack';
import type { Cell } from './board';

export type InputKind =
  | 'left' | 'right'
  | 'cw' | 'ccw' | 'flip'
  | 'soft' | 'hard'
  | 'hold'
  | 'gravity'
  | 'garbage';

export interface Input {
  /** Frame this input happens on. Must be non-decreasing across the log. */
  frame: number;
  kind: InputKind;
  /** For `garbage`: how many lines, and which column the hole sits in. */
  lines?: number;
  hole?: number;
}

export interface GameState {
  board: Cell[][];
  active: ActivePiece | null;
  hold: PieceKind | null;
  holdUsed: boolean;
  /** Upcoming pieces; always kept at least 5 deep. */
  queue: PieceKind[];
  bagIndex: number;
  seed: number;
  frame: number;
  linesCleared: number;
  /** Garbage waiting to land, oldest first. */
  incoming: Array<{ lines: number; hole: number }>;
  attacksSent: number;
  combo: number;
  backToBack: number;
  dead: boolean;
  /** Every clear so far - the record a checkpoint's claims are checked against. */
  clears: ClearEvent[];
}
