/**
 * The seat picker's rows as the dialog draws them: whether a seat shares its
 * account with another (the hot-seat case), how it will be played, and which
 * accounts may take it.
 */
import type { Row } from '@/utils/games/start-table/seat-specs';
import type { Translate } from '@/i18n/keys';

export interface SeatChip {
  pubkey: string;
  selected: boolean;
  disabled: boolean;
}

export interface SeatRowView {
  row: Row;
  /** The row's account holds more than one seat: those players share a machine. */
  shared: boolean;
  chips: SeatChip[];
}

/**
 * One view per row. On a real-time table an account can hold exactly one
 * seat, so an account already seated elsewhere cannot take another.
 */
export function seatRowViews(
  rows: readonly Row[],
  joined: readonly string[],
  seatsFor: (pubkey: string) => number,
  realtime: boolean,
): SeatRowView[] {
  return rows.map((row) => ({
    row,
    shared: seatsFor(row.by) > 1,
    chips: joined.map((pubkey) => ({
      pubkey,
      selected: row.by === pubkey,
      disabled: realtime && row.by !== pubkey && seatsFor(pubkey) > 0,
    })),
  }));
}

/** How a seat is played: from its own device, on a shared machine, or remotely. */
export function seatModeLabel(t: Translate, realtime: boolean, shared: boolean, controllerName: string): string {
  if (realtime) return t('games.startTable.ownDevice');
  return shared ? t('games.startTable.onMachine', { name: controllerName }) : t('games.startTable.remote');
}

/** The footer's status line: the seat count, then whatever stops the start. */
export function seatFooterMeta(
  t: Translate,
  counts: { rows: number; min: number; max: number; saved: number | null },
  problems: { tooFew: boolean; tooMany: boolean; wrongForSave: boolean },
): string {
  return [
    t('games.startTable.seatCount', { count: counts.rows, min: counts.min, max: counts.max }),
    problems.tooFew && t('games.startTable.needsMore'),
    problems.tooMany && t('games.startTable.tooMany'),
    problems.wrongForSave && t('games.startTable.saveHas', { count: counts.saved ?? 0 }),
  ].filter(Boolean).join(' · ');
}
