/**
 * The attack table: how many lines of garbage a clear sends.
 */

export interface ClearEvent {
  frame: number;
  lines: number;
  /** Lines of garbage this clear sends, after combo / back-to-back / spin. */
  attack: number;
  spin: boolean;
  miniSpin: boolean;
  perfectClear: boolean;
  combo: number;
  backToBack: number;
}

/** Combo bonus, tetr.io-ish: it ramps and then flattens. */
const COMBO_BONUS = [0, 0, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4, 5];

/**
 * Lines of garbage a clear sends.
 *
 * Roughly the modern multiplayer table: a quad is worth four, spins pay
 * double what the same line count pays flat, back-to-back adds one, combo
 * ramps, and a perfect clear is worth ten.
 */
export function attackFor(opts: {
  lines: number;
  spin: boolean;
  miniSpin: boolean;
  combo: number;
  backToBack: number;
  perfectClear: boolean;
}): number {
  const { lines, spin, miniSpin, combo, backToBack, perfectClear } = opts;
  if (lines === 0) return 0;

  let base: number;
  if (spin) base = lines * 2;
  else if (miniSpin) base = lines === 1 ? 0 : lines - 1;
  else base = lines === 1 ? 0 : lines === 2 ? 1 : lines === 3 ? 2 : 4;

  if (backToBack > 0 && (spin || lines === 4)) base += 1;
  base += COMBO_BONUS[Math.min(combo, COMBO_BONUS.length - 1)];
  if (perfectClear) base += 10;
  return base;
}
