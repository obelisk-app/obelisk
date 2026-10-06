'use client';

import { useEffect, useRef } from 'react';
import { decodeBoard, HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import { PIECE_COLORS } from './piece-colors';
import { canvasDpr } from './block-paint';

/**
 * An opponent's well.
 *
 * Drawn from the snapshot they published a few seconds ago, which is the
 * honest thing to show: their real board is on their machine, and the relay
 * carries a picture of it every few seconds rather than every frame.
 */
export default function MiniBoard({
  board,
  height,
  dead,
  cell = 6,
}: {
  board: string | null;
  height: number;
  dead: boolean;
  cell?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvasDpr();
    const w = WIDTH * cell;
    const h = HEIGHT * cell;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, w, h);

    const rows = board ? decodeBoard(board) : null;
    if (rows) {
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < WIDTH; x++) {
          const value = rows[y][x];
          if (!value) continue;
          ctx.fillStyle = dead ? '#3f3f46' : (PIECE_COLORS[value] ?? '#888');
          ctx.fillRect(x * cell, y * cell, cell - 0.5, cell - 0.5);
        }
      }
    } else {
      // No snapshot yet: fall back to a bar for how buried they are.
      const filled = Math.min(HEIGHT, height);
      ctx.fillStyle = dead ? '#3f3f46' : '#b4f953';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, h - filled * cell, w, filled * cell);
      ctx.globalAlpha = 1;
    }

    if (dead) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, w, h);
    }
  }, [board, height, dead, cell]);

  return (
    <canvas
      ref={ref}
      style={{ width: WIDTH * cell, height: HEIGHT * cell }}
      className="rounded-md border border-lc-border"
      data-testid="stacker-miniboard"
    />
  );
}
