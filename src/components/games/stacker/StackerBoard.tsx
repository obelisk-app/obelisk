'use client';

import type { StackerRunner } from '@/lib/games/stacker/runner';
import { useTranslations } from 'next-intl';
import { useStackerBoard } from '@/hooks/games/stacker/useStackerBoard';

/**
 * The playfield.
 *
 * It renders itself: `useStackerBoard` subscribes to the runner's frame
 * callback and paints straight to the canvas, so drawing never goes through
 * React.
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
  const { canvasRef, style } = useStackerBoard({ runner, cell, dimmed });
  return (
    <canvas
      ref={canvasRef}
      style={style}
      className="rounded-xl border border-lc-border shadow-[0_0_50px_-16px_rgba(180,249,83,0.35)]"
      data-testid="stacker-board"
      aria-label={t('games.stackerBoard')}
    />
  );
}
