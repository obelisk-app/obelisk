'use client';

import { useMiniBoard } from '@/hooks/games/stacker/useMiniBoard';

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
  const { canvasRef, style } = useMiniBoard({ board, height, dead, cell });
  return (
    <canvas
      ref={canvasRef}
      style={style}
      className="rounded-md border border-lc-border"
      data-testid="stacker-miniboard"
    />
  );
}
