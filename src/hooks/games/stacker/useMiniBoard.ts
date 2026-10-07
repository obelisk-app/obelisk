'use client';

import { useEffect, useRef } from 'react';
import { PIECE_COLORS } from '@/utils/games/stacker/piece-colors';
import { canvasDpr } from '@/utils/games/stacker/block-paint';
import { miniBoardRects, miniBoardSize } from '@/utils/games/stacker/mini-board-rects';

/**
 * The opponent's mini well: sizes the canvas for the screen's pixel ratio and
 * repaints it whenever their snapshot, height or state changes. What is
 * painted is decided by `miniBoardRects`.
 */
export function useMiniBoard({ board, height, dead, cell }: {
  board: string | null;
  height: number;
  dead: boolean;
  cell: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = miniBoardSize(cell);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvasDpr();
    const { width: w, height: h } = miniBoardSize(cell);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    for (const rect of miniBoardRects(board, height, dead, cell, PIECE_COLORS)) {
      ctx.fillStyle = rect.color;
      ctx.globalAlpha = rect.alpha;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.globalAlpha = 1;
  }, [board, height, dead, cell]);

  return { canvasRef, style: size };
}
