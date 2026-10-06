'use client';

import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import { CANVAS_WIDTH, CANVAS_HEIGHT, type GameState, type HexCoord } from 'vesta';
import { useTranslation } from '@/i18n/context';
import { drawVestaBoard } from './draw-board';
import { resolveBoardPick, validPositionKeys, type EdgePick, type VertexPick } from './board-pick';
import type { PickMode } from './pick-mode';

export { VESTA_PLAYER_COLORS } from './palette';
export type { PickMode } from './pick-mode';

export interface VestaBoardProps {
  state: GameState;
  mode: PickMode;
  onPickVertex?: (spot: VertexPick) => void;
  onPickEdge?: (edge: EdgePick) => void;
  onPickHex?: (hex: HexCoord) => void;
}

/**
 * The board, drawn on a canvas from the engine's own geometry.
 *
 * The set of legal spots comes from upstream's `getValidPositions`, not from
 * anything this component believes about the rules, so the highlights are the
 * rules, and a click that lands on one is a move the engine will accept.
 */
export default function VestaBoard({ state, mode, onPickVertex, onPickEdge, onPickHex }: VestaBoardProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const validKeys = useCallback(() => validPositionKeys(state, mode), [state, mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawVestaBoard(ctx, state, mode, validKeys());
  }, [state, mode, validKeys]);

  const onClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (mode === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // The canvas is drawn at a fixed internal size and scaled by CSS, so a
    // click has to be mapped back through that ratio before it means anything.
    const x = ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;

    const pick = resolveBoardPick(mode, x, y, validKeys());
    if (!pick) return;
    if (pick.kind === 'hex') onPickHex?.(pick.hex);
    else if (pick.kind === 'edge') onPickEdge?.(pick.edge);
    else onPickVertex?.(pick.spot);
  };

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={onClick}
      className={`w-full rounded-lg border border-lc-border ${mode === 'none' ? '' : 'cursor-pointer'}`}
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      data-testid="vesta-board"
      aria-label={t('games.vestaBoard')}
    />
  );
}
