// Shared game engine types. Each game implements a GameDefinition and
// registers itself in registry.ts. The runtime (API routes + server.ts)
// is game-agnostic and only talks to this interface.
//
// Game lifecycle:
//   waiting      → created, accepting joins up to maxPlayers
//   in_progress  → creator started; engine is applying turns
//   finished     → engine returned `nextTurn: null` or all-but-one eliminated
//   cancelled    → all participants left before the game started
//
// Finish rules (terminal state):
//   - A GameDefinition MUST set `nextTurn: null` in `applyAction` / `onTimeout`
//     to finish the game. The runtime persists `status: "finished"`, writes
//     `winnerPubkey` (or leaves null for draws), clears turn timers, and
//     broadcasts a `game-finished` socket event.
//   - Clients MUST surface finished games with a closable pop-up
//     (see `src/components/games/GameOverModal.tsx`). The dock and the
//     fullscreen view both mount the modal and pass an `onClose` that
//     performs the host-specific cleanup (dismiss dock / exit fullscreen).
//     Don't auto-close finished games — let the user acknowledge the result.

export type GameStatus = 'waiting' | 'in_progress' | 'finished' | 'cancelled';

export interface ApplyResult<S> {
  state: S;
  nextTurn: string | null; // pubkey; null means game ended
  winner?: string | null;
  draw?: boolean;
  eliminated?: string[];
}

export interface GameDefinition<S = any, A = any> {
  type: string;
  displayName: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  defaultTurnTimeoutS: number;

  initialState(participants: string[], opts?: any): S;
  firstTurn(participants: string[]): string;

  validateAction(state: S, action: A, actorPubkey: string): { ok: boolean; error?: string };
  applyAction(state: S, action: A, actorPubkey: string, participants: string[]): ApplyResult<S>;
  onTimeout(state: S, timedOutPubkey: string, participants: string[]): ApplyResult<S>;
}
