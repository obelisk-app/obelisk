'use client';

import { useEffect, useRef } from 'react';
import type { PieceKind } from '@/lib/games/stacker/engine';
import { PIECE_COLORS, CHIP_COLUMNS, CHIP_ROWS } from '@/constants/games/stacker';
import { canvasDpr, drawConnected } from '@/utils/games/stacker/block-paint';
import { pieceChipCells, pieceColor } from '@/utils/games/stacker/piece-chip-cells';

/**
 * A piece in miniature, for the next queue and the hold slot: sizes the
 * canvas and paints the piece's cells joined, centred, dimmed when asked.
 */
export function usePieceChip({ kind, dim, size }: { kind: PieceKind | null; dim?: boolean; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvasDpr();
    canvas.width = size * CHIP_COLUMNS * dpr;
    canvas.height = size * CHIP_ROWS * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size * CHIP_COLUMNS, size * CHIP_ROWS);
    if (!kind) return;

    const color = pieceColor(kind, PIECE_COLORS);
    ctx.globalAlpha = dim ? 0.45 : 1;
    for (const cell of pieceChipCells(kind)) {
      drawConnected(ctx, cell.x * size, cell.y * size, size, color, cell.joined, false);
    }
    ctx.globalAlpha = 1;
  }, [kind, dim, size]);

  return { canvasRef, style: { width: size * CHIP_COLUMNS, height: size * CHIP_ROWS } };
}
