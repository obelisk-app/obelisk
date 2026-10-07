'use client';

import { useEffect, useRef } from 'react';
import { HEIGHT, WIDTH } from '@/lib/games/stacker/engine';
import type { StackerRunner } from '@/lib/games/stacker/runner';
import { canvasDpr } from '@/components/games/stacker/block-paint';
import { drawWell } from '@/components/games/stacker/draw-well';

/**
 * The playfield paints itself: this subscribes to the runner's frame
 * callback and draws straight to the canvas, so drawing never goes through
 * React. `dimmed` is read through a ref so a change to it does not tear the
 * subscription down; a new runner or cell size does.
 */
export function useStackerBoard({ runner, cell, dimmed }: { runner: StackerRunner; cell: number; dimmed?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dimmedRef = useRef(dimmed);
  useEffect(() => { dimmedRef.current = dimmed; }, [dimmed]);

  useEffect(() => {
    const canvas = canvasRef.current;
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

  return { canvasRef, style: { width: WIDTH * cell, height: HEIGHT * cell } };
}
