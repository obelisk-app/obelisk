/**
 * The seats a new table publishes, from the rows being edited.
 */
import { localSeatId, type SeatSpec } from '@/lib/games/protocol/protocol';

export interface Row {
  /** Stable identity while editing; the published seat id is derived at the end. */
  rowId: string;
  label: string;
  /** Pubkey that will sign this seat's moves. */
  by: string;
  /** Name this seat had in the loaded save, when there is one. */
  savedName?: string;
}

/**
 * Seat ids: the first seat an account holds is its pubkey, the rest are
 * `<pubkey>#n`. That keeps an ordinary one-seat-each table byte-identical
 * to what clients published before hot-seat existed.
 */
export function seatSpecsFor(rows: readonly Row[], nameOf: (pubkey: string) => string): SeatSpec[] {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const n = counts.get(r.by) ?? 0;
    counts.set(r.by, n + 1);
    return { id: localSeatId(r.by, n), by: r.by, label: r.label || nameOf(r.by) };
  });
}
