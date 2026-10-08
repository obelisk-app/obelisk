'use client';

import { useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, type GameState, type HexCoord } from 'vesta';
import { drawVestaBoard } from '@/utils/games/vesta/draw-board';
import { resolveBoardPick, validPositionKeys, type EdgePick, type VertexPick } from '@/utils/games/vesta/board-pick';
import type { PickMode } from '@/types/games/vesta/pick-mode';
import { boardPointFromClick } from '@/utils/games/vesta/board-click';

export interface VestaBoardInput {
  state: GameState;
  mode: PickMode;
  onPickVertex?: (spot: VertexPick) => void;
  onPickEdge?: (edge: EdgePick) => void;
  onPickHex?: (hex: HexCoord) => void;
}

/**
 * The board canvas: repaints on every state or mode change, highlighting the
 * engine's own legal spots for the mode, and turns a click into the vertex,
 * edge or hex it landed on, if that is one the rules allow.
 */
export function useVestaBoard({ state, mode, onPickVertex, onPickEdge, onPickHex }: VestaBoardInput) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const valid = useMemo(() => validPositionKeys(state, mode), [state, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawVestaBoard(ctx, state, mode, valid);
  }, [state, mode, valid]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y } = boardPointFromClick(e.clientX, e.clientY, canvas.getBoundingClientRect(), {
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
    });
    const pick = resolveBoardPick(mode, x, y, valid);
    if (!pick) return;
    if (pick.kind === 'hex') onPickHex?.(pick.hex);
    else if (pick.kind === 'edge') onPickEdge?.(pick.edge);
    else onPickVertex?.(pick.spot);
  };

  return { canvasRef, onClick, pickable: mode !== 'none' };
}
