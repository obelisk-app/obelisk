/**
 * Moving the active piece: the queue, spawning, sliding and rotating with
 * wall kicks. Mutates the state it is given, like the rest of the engine.
 */
import { bag, kicksFor, type ActivePiece, type PieceKind, type Rotation } from './pieces';
import { collides, BUFFER } from './board';
import type { GameState } from './state';

export function refillQueue(state: GameState): void {
  while (state.queue.length < 7) {
    state.queue.push(...bag(state.seed, state.bagIndex));
    state.bagIndex += 1;
  }
}

function spawnPositionFor(kind: PieceKind): ActivePiece {
  return {
    kind,
    x: 3,
    // Spawn just above the visible ceiling, the way every modern client does.
    y: BUFFER - 2,
    rotation: 0,
  };
}

export function spawn(state: GameState, forced?: PieceKind): void {
  refillQueue(state);
  const kind = forced ?? state.queue.shift()!;
  const piece = spawnPositionFor(kind);
  if (collides(state.board, piece)) {
    // Blocked at spawn - the stack reached the ceiling.
    state.dead = true;
    state.active = null;
    return;
  }
  state.active = piece;
  state.holdUsed = false;
  refillQueue(state);
}

export function tryMove(state: GameState, dx: number, dy: number): boolean {
  if (!state.active) return false;
  const moved = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (collides(state.board, moved)) return false;
  state.active = moved;
  return true;
}

export function tryRotate(state: GameState, delta: 1 | 2 | 3): boolean {
  if (!state.active) return false;
  const from = state.active.rotation;
  const to = ((from + delta) % 4) as Rotation;
  const kicks = delta === 2 ? [[0, 0] as [number, number]] : kicksFor(state.active.kind, from, to);
  for (const [kx, ky] of kicks) {
    const candidate: ActivePiece = { ...state.active, rotation: to, x: state.active.x + kx, y: state.active.y - ky };
    if (!collides(state.board, candidate)) {
      state.active = candidate;
      return true;
    }
  }
  return false;
}
