import {
  cellsOf,
  ghostOf,
  BUFFER,
  HEIGHT,
  WIDTH,
  GARBAGE_CELL,
  PIECES,
  type Cell,
  type GameState,
} from '@/lib/games/stacker/engine';
import { PIECE_COLORS } from '@/constants/games/stacker';
import { drawConnected, roundRect } from './block-paint';

/**
 * Paint one frame of the well: background and grid, the settled stack, the
 * ghost and the live piece, the danger glow near the ceiling, and the dim
 * veil when the board is paused or dead.
 */
export function drawWell(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  cell: number,
  dimmed: boolean | undefined,
): void {
  const w = WIDTH * cell;
  const h = HEIGHT * cell;
  ctx.clearRect(0, 0, w, h);

  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0e0e11');
  bg.addColorStop(1, '#08080a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 1; x < WIDTH; x++) {
    ctx.beginPath();
    ctx.moveTo(Math.round(x * cell) + 0.5, 0);
    ctx.lineTo(Math.round(x * cell) + 0.5, h);
    ctx.stroke();
  }
  for (let y = 1; y < HEIGHT; y++) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y * cell) + 0.5);
    ctx.lineTo(w, Math.round(y * cell) + 0.5);
    ctx.stroke();
  }

  // The settled stack, drawn connected.
  const at = (x: number, y: number): Cell =>
    (x < 0 || x >= WIDTH || y < 0 || y >= state.board.length) ? -1 : state.board[y][x];

  for (let by = BUFFER; by < state.board.length; by++) {
    const vy = by - BUFFER;
    if (vy < 0 || vy >= HEIGHT) continue;
    for (let bx = 0; bx < WIDTH; bx++) {
      const value = state.board[by][bx];
      if (value === 0) continue;
      drawConnected(ctx, bx * cell, vy * cell, cell, PIECE_COLORS[value] ?? '#888', {
        up: at(bx, by - 1) === value,
        down: at(bx, by + 1) === value,
        left: at(bx - 1, by) === value,
        right: at(bx + 1, by) === value,
      }, value === GARBAGE_CELL);
    }
  }

  // Ghost, then the live piece over it.
  if (state.active) {
    const color = PIECE_COLORS[PIECES.indexOf(state.active.kind) + 1] ?? '#fff';
    const live = cellsOf(state.active);
    const ghost = ghostOf(state);

    if (ghost) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      for (const [x, y] of cellsOf(ghost)) {
        const vy = y - BUFFER;
        if (vy < 0 || vy >= HEIGHT) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1.5, cell * 0.08);
        roundRect(ctx, x * cell + cell * 0.15, vy * cell + cell * 0.15, cell * 0.7, cell * 0.7, cell * 0.12);
        ctx.stroke();
      }
      ctx.restore();
    }

    const member = new Set(live.map(([x, y]) => `${x},${y}`));
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = cell * 0.5;
    for (const [x, y] of live) {
      const vy = y - BUFFER;
      if (vy < 0 || vy >= HEIGHT) continue;
      drawConnected(ctx, x * cell, vy * cell, cell, color, {
        up: member.has(`${x},${y - 1}`),
        down: member.has(`${x},${y + 1}`),
        left: member.has(`${x - 1},${y}`),
        right: member.has(`${x + 1},${y}`),
      }, false);
    }
    ctx.restore();
  }

  // Danger glow as the stack nears the ceiling.
  let top = HEIGHT;
  for (let by = BUFFER; by < state.board.length; by++) {
    if (state.board[by].some((c) => c !== 0)) { top = by - BUFFER; break; }
  }
  const danger = Math.max(0, 1 - top / 6);
  if (danger > 0) {
    const glow = ctx.createLinearGradient(0, 0, 0, h * 0.45);
    glow.addColorStop(0, `rgba(239,68,68,${0.3 * danger})`);
    glow.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h * 0.45);
  }

  if (dimmed || state.dead) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fillRect(0, 0, w, h);
  }
}
