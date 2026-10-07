/**
 * The Stacker table's three relay events, fired and forgotten.
 *
 * A Stacker board runs in real time on every client, so nothing it publishes
 * may stall it: a dropped attack, checkpoint or top-out is logged and the
 * board carries on.
 */
import type { GameSession } from '@/lib/games/session/session';
import { publishAttack, publishCheckpoint, publishTopOut } from '@/services/games/transport';

type Table = Pick<GameSession, 'channelId' | 'id'>;

export interface StackerCheckpoint {
  frame: number;
  attacksSent: number;
  linesCleared: number;
  stackHeight: number;
  inputs?: string;
  board: string;
}

/** Garbage sent from `seat` to `target`. */
export function sendStackerAttack(table: Table, seat: string, target: string, lines: number, hole: number, nonce: number): void {
  publishAttack(table.channelId, table.id, { seat, target, lines, hole, nonce })
    .catch((err) => console.warn('[stacker] attack failed to publish', err));
}

/** A seat's periodic snapshot of its own well. */
export function sendStackerCheckpoint(table: Table, seat: string, payload: StackerCheckpoint): void {
  publishCheckpoint(table.channelId, table.id, { seat, ...payload })
    .catch((err) => console.warn('[stacker] checkpoint failed to publish', err));
}

/** A seat's well filled to the top. */
export function sendStackerTopOut(table: Table, seat: string): void {
  publishTopOut(table.channelId, table.id, seat)
    .catch((err) => console.warn('[stacker] topout failed to publish', err));
}
