import { GARBAGE_CELL } from '@/lib/games/stacker/engine';

/** One colour per piece, plus grey for garbage. */
export const PIECE_COLORS: Record<number, string> = {
  1: '#22d3ee', // I
  2: '#3b82f6', // J
  3: '#f97316', // L
  4: '#facc15', // O
  5: '#b4f953', // S
  6: '#a855f7', // T
  7: '#ef4444', // Z
  [GARBAGE_CELL]: '#4b5563',
};
