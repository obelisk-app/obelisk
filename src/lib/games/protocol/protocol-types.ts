/**
 * Game wire types: the ops, the raw event shape, a seat, and the parsed
 * form of every op. Re-exported from `protocol.ts`.
 */

export type GameOp =
  | 'create' | 'join' | 'start' | 'move' | 'timeout' | 'resign' | 'cancel'
  // Real-time games (see src/lib/games/stacker/) don't take turns. Their
  // players run their own boards locally and only put these on the wire.
  | 'attack' | 'topout' | 'checkpoint';

export interface GameEvent {
  readonly id: string;
  readonly pubkey: string;
  readonly created_at: number;
  readonly kind: number;
  readonly tags: string[][];
  readonly content: string;
}

interface BaseParsed {
  id: string;
  pubkey: string;
  createdAt: number;
  channelId: string;
  /** Table id - the `create` event's id. For `create` itself, its own id. */
  gameId: string;
}

/**
 * A seat at the table. `id` is the engine's identity for the player - NOT a
 * pubkey, because one person can hold several seats (hot-seat: two players
 * sharing one browser and one account). `by` is the pubkey allowed to publish
 * that seat's moves.
 *
 * For an ordinary all-remote table `id === by`, which is why every
 * single-seat-per-person table reads exactly as it did before seats existed.
 */
export interface SeatSpec {
  id: string;
  by: string;
  label?: string;
}

export type ParsedGameEvent =
  | (BaseParsed & { op: 'create'; game: string; opts: Record<string, unknown>; turnTimeoutS: number; nonce?: string })
  | (BaseParsed & { op: 'join' })
  | (BaseParsed & { op: 'start'; seats: SeatSpec[] })
  | (BaseParsed & { op: 'move'; n: number; action: unknown; seat?: string })
  | (BaseParsed & { op: 'timeout'; n: number })
  | (BaseParsed & { op: 'resign'; seat?: string })
  | (BaseParsed & { op: 'cancel' })
  /** Garbage sent from one seat to another. */
  | (BaseParsed & { op: 'attack'; seat: string; target: string; lines: number; hole: number; nonce: number })
  /** "I topped out" - the sender removing themselves from a real-time match. */
  | (BaseParsed & { op: 'topout'; seat: string })
  /**
   * A periodic "here is my board, and here is the input log that produced it".
   * Anyone can replay the log against the shared seed and check the claim.
   */
  | (BaseParsed & {
      op: 'checkpoint';
      seat: string;
      frame: number;
      attacksSent: number;
      linesCleared: number;
      stackHeight: number;
      /** Compressed input log since the start of the match. */
      inputs?: string;
      /** Compact snapshot of the visible well, for spectators and opponents. */
      board?: string;
    });
