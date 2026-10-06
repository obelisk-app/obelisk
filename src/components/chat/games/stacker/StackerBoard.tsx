'use client';

import { useEffect, useRef } from 'react';
import { HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import type { StackerRunner } from '@/lib/games/stacker/runner';
import { useTranslations } from 'next-intl';
import { canvasDpr } from './block-paint';
import { drawWell } from './draw-well';

export { PIECE_COLORS } from './piece-colors';
export { default as PieceChip } from './PieceChip';
export { default as MiniBoard } from './MiniBoard';

/**
 * The playfield.
 *
 * It renders itself: the component subscribes to the runner's frame callback
 * and paints straight to the canvas, so drawing never goes through React.
 *
 * Blocks are drawn **connected**: a cell only rounds the corners and draws the
 * bevel on edges where its neighbour is a different colour. Four separate
 * rounded squares read as four squares; the same four with their shared seams
 * removed read as a tetromino, which is the whole difference between this
 * looking like a grid of blocks and looking like a piece.
 */
export default function StackerBoard({
  runner,
  cell = 26,
  dimmed,
}: {
  runner: StackerRunner;
  /** Pixel size of a cell. The table sizes this to the space it has. */
  cell?: number;
  dimmed?: boolean;
}) {
  const t = useTranslations();
  const ref = useRef<HTMLCanvasElement>(null);
  const dimmedRef = useRef(dimmed);
  useEffect(() => { dimmedRef.current = dimmed; }, [dimmed]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = canvasDpr();
    const w = WIDTH * cell;
    const h = HEIGHT * cell;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    return runner.onFrame((state) => drawWell(ctx, state, cell, dimmedRef.current));
  }, [runner, cell]);

  return (
    <canvas
      ref={ref}
      style={{ width: WIDTH * cell, height: HEIGHT * cell }}
      className="rounded-xl border border-lc-border shadow-[0_0_50px_-16px_rgba(180,249,83,0.35)]"
      data-testid="stacker-board"
      aria-label={t('games.stackerBoard')}
    />
  );
}
