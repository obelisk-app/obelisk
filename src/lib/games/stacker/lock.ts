/**
 * Locking a piece: spin detection, line clears, the attack it sends, the
 * garbage it cancels or lets in, then the next spawn.
 */
import { cellsOf, BOX, PIECES, type ActivePiece, type Rotation } from './pieces';
import { attackFor } from './attack';
import { collides, GARBAGE_CELL, TOTAL_HEIGHT, WIDTH, type Cell } from './board';
import { spawn } from './motion';
import type { GameState } from './state';

/** Is the piece pinned on three of its four corners? That's a spin. */
function detectSpin(state: GameState, piece: ActivePiece, lastWasKick: boolean): { spin: boolean; mini: boolean } {
  if (piece.kind !== 'T') return { spin: false, mini: false };
  const box = BOX.T;
  const corners: Array<[number, number]> = [
    [piece.x, piece.y],
    [piece.x + box - 1, piece.y],
    [piece.x, piece.y + box - 1],
    [piece.x + box - 1, piece.y + box - 1],
  ];
  const filled = corners.filter(([x, y]) =>
    x < 0 || x >= WIDTH || y >= TOTAL_HEIGHT || (y >= 0 && state.board[y][x] !== 0));
  if (filled.length < 3) return { spin: false, mini: false };
  // Front corners are the two the T points toward; both filled = full spin.
  const frontByRotation: Record<Rotation, Array<0 | 1 | 2 | 3>> = {
    0: [0, 1], 1: [1, 3], 2: [2, 3], 3: [0, 2],
  };
  const front = frontByRotation[piece.rotation];
  const frontFilled = front.filter((i) => {
    const [x, y] = corners[i];
    return x < 0 || x >= WIDTH || y >= TOTAL_HEIGHT || (y >= 0 && state.board[y][x] !== 0);
  }).length;
  if (frontFilled === 2) return { spin: true, mini: false };
  return { spin: false, mini: lastWasKick };
}

function clearLines(state: GameState): number {
  let cleared = 0;
  for (let y = TOTAL_HEIGHT - 1; y >= 0; y--) {
    if (state.board[y].every((c) => c !== 0)) {
      state.board.splice(y, 1);
      state.board.unshift(Array<Cell>(WIDTH).fill(0));
      cleared += 1;
      y += 1;
    }
  }
  return cleared;
}

function boardEmpty(state: GameState): boolean {
  return state.board.every((row) => row.every((c) => c === 0));
}

/** Push queued garbage up from the bottom, each row with one hole. */
function applyGarbage(state: GameState): void {
  while (state.incoming.length > 0) {
    const next = state.incoming.shift()!;
    for (let i = 0; i < next.lines; i++) {
      state.board.shift();
      const row = Array<Cell>(WIDTH).fill(GARBAGE_CELL);
      row[next.hole % WIDTH] = 0;
      state.board.push(row);
    }
  }
  // If the stack was pushed into the active piece, nudge it up.
  if (state.active) {
    let guard = 0;
    while (collides(state.board, state.active) && guard++ < TOTAL_HEIGHT) {
      state.active = { ...state.active, y: state.active.y - 1 };
    }
    if (collides(state.board, state.active)) state.dead = true;
  }
}

export function lockPiece(state: GameState, lastWasKick: boolean): void {
  const piece = state.active;
  if (!piece) return;

  const { spin, mini } = detectSpin(state, piece, lastWasKick);

  const index = PIECES.indexOf(piece.kind) + 1;
  for (const [x, y] of cellsOf(piece)) {
    if (y < 0 || y >= TOTAL_HEIGHT || x < 0 || x >= WIDTH) continue;
    state.board[y][x] = index;
  }
  state.active = null;

  const lines = clearLines(state);
  const perfect = lines > 0 && boardEmpty(state);

  if (lines > 0) {
    state.combo += 1;
    const isB2BClear = lines === 4 || spin;
    const attack = attackFor({
      lines,
      spin,
      miniSpin: mini,
      combo: state.combo - 1,
      backToBack: state.backToBack,
      perfectClear: perfect,
    });
    state.backToBack = isB2BClear ? state.backToBack + 1 : 0;
    state.linesCleared += lines;
    state.attacksSent += attack;
    state.clears.push({
      frame: state.frame,
      lines,
      attack,
      spin,
      miniSpin: mini,
      perfectClear: perfect,
      combo: state.combo - 1,
      backToBack: state.backToBack,
    });
    // Outgoing attacks cancel what is waiting to land on you.
    let remaining = attack;
    while (remaining > 0 && state.incoming.length > 0) {
      const head = state.incoming[0];
      const eaten = Math.min(remaining, head.lines);
      head.lines -= eaten;
      remaining -= eaten;
      if (head.lines === 0) state.incoming.shift();
    }
  } else {
    state.combo = 0;
    // A piece that cleared nothing lets the queued garbage in.
    applyGarbage(state);
  }

  if (!state.dead) spawn(state);
}
