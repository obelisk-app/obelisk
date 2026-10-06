/**
 * The table a replay produces. Re-exported from `session.ts`.
 */
import type { SeatSpec } from './protocol';
import type { MatchState } from './stacker/match';

export type GameStatus = 'waiting' | 'in_progress' | 'finished' | 'cancelled';

export interface GameSession {
  id: string;
  channelId: string;
  game: string;
  status: GameStatus;
  createdBy: string;
  createdAt: number;
  opts: Record<string, unknown>;
  turnTimeoutS: number;
  minPlayers: number;
  maxPlayers: number;
  /**
   * Seat ids in seat order - this is what the engine sees as "the players".
   * A seat id is NOT necessarily a pubkey: one account can hold several seats
   * when people are playing hot-seat on one machine.
   */
  participants: string[];
  /** Seat id → who may publish its moves, plus the display label. */
  seats: SeatSpec[];
  /** Everyone who asked for a seat while the table was `waiting`. */
  joined: string[];
  /** Board state, or `null` before `start`. */
  state: unknown;
  currentTurn: string | null;
  /** Index of the turn `currentTurn` is being asked to play. */
  turnIndex: number;
  /** Unix seconds the current turn began; `null` when not in progress. */
  turnStartedAt: number | null;
  /** When a real-time match began, so clients can align their frame counters. */
  startedAt?: number;
  /** Unix seconds the current turn expires; `null` when the table has no clock. */
  turnDeadline: number | null;
  winner: string | null;
  draw: boolean;
  eliminated: string[];
  finishedAt: number | null;
  /**
   * Real-time games only (Stacker). Turn-based tables leave this null - they
   * have a turn, which is a different thing entirely.
   */
  match: MatchState | null;
}
