'use client';

import { CANVAS_WIDTH, CANVAS_HEIGHT } from 'vesta';
import { useTranslations } from 'next-intl';
import { useVestaBoard, type VestaBoardInput } from '@/hooks/games/vesta/useVestaBoard';

export { VESTA_PLAYER_COLORS } from './palette';
export type { PickMode } from './pick-mode';

export type VestaBoardProps = VestaBoardInput;

/**
 * The board, drawn on a canvas from the engine's own geometry.
 *
 * The set of legal spots comes from upstream's `getValidPositions`, not from
 * anything this component believes about the rules, so the highlights are the
 * rules, and a click that lands on one is a move the engine will accept.
 */
export default function VestaBoard(props: VestaBoardProps) {
  const t = useTranslations();
  const { canvasRef, onClick, pickable } = useVestaBoard(props);
  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      onClick={onClick}
      className={`w-full rounded-lg border border-lc-border ${pickable ? 'cursor-pointer' : ''}`}
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      data-testid="vesta-board"
      aria-label={t('games.vestaBoard')}
    />
  );
}
