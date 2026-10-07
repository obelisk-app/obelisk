/**
 * Pure pieces of the Stacker table's view: who gets the garbage, which
 * opponents to show, and the numbers the meter, the banner and the mini
 * wells are drawn from.
 */
import type { SeatProgress } from '@/lib/games/stacker/match';
import type { StackerStats } from '@/lib/games/stacker/runner';

/** Garbage lines that fill the incoming meter to the top. */
const METER_FULL_LINES = 12;

/**
 * The run's identity in the run registry: per player per table, so two seats
 * on one account are two separate runs and reopening the same table lands
 * back on the same one.
 */
export function stackerMatchKey(sessionId: string, mySeat: string | null): string {
  return `${sessionId}:${mySeat ?? 'spectator'}`;
}

/**
 * Who gets the garbage. With one opponent it is obvious; with several it is
 * spread at random, which stops a three-way match turning into everybody
 * burying whoever happens to be first in the list.
 */
export function pickGarbageTarget(
  alive: readonly string[],
  mySeat: string | null,
  random: () => number = Math.random,
): string | null {
  const others = alive.filter((s) => s !== mySeat);
  if (others.length === 0) return null;
  return others[Math.floor(random() * others.length)];
}

/** Every other seat with the progress it has published; a seat with none yet is left out. */
export function opponentRows(
  participants: readonly string[],
  mySeat: string | null,
  progress: Readonly<Record<string, SeatProgress>>,
): Array<{ seat: string; progress: SeatProgress }> {
  return participants
    .filter((seat) => seat !== mySeat && !!progress[seat])
    .map((seat) => ({ seat, progress: progress[seat] }));
}

/** How full the incoming-garbage meter is, as a CSS percentage (0-100). */
export function garbageMeterPercent(incoming: number): number {
  return Math.min(100, (incoming / METER_FULL_LINES) * 100);
}

/** Cell size of an opponent's mini well for a playfield of `cell` pixels. */
export function miniCellSize(cell: number): number {
  return Math.max(4, Math.round(cell / 4));
}

/** The clear banner's colour: purple for a spin, cyan for four lines or more, green otherwise. */
export function clearBannerColor(banner: NonNullable<StackerStats['lastClear']>): string {
  if (banner.spin) return '#a855f7';
  return banner.lines >= 4 ? '#22d3ee' : '#b4f953';
}
