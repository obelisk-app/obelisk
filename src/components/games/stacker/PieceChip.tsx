'use client';

import type { PieceKind } from '@/lib/games/stacker/engine';
import { usePieceChip } from '@/hooks/games/stacker/usePieceChip';

/** A piece drawn in miniature, for the next queue and the hold slot. */
export default function PieceChip({ kind, label, dim, size = 15 }: { kind: PieceKind | null; label?: string; dim?: boolean; size?: number }) {
  const { canvasRef, style } = usePieceChip({ kind, dim, size });
  return (
    <div className="text-center">
      {label && <div className="text-[9px] uppercase tracking-[0.12em] text-lc-muted">{label}</div>}
      <canvas
        ref={canvasRef}
        style={style}
        className="mt-0.5"
        data-testid={label ? `chip-${label.toLowerCase()}` : 'chip'}
      />
    </div>
  );
}
