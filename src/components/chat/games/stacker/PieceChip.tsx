'use client';

import { useEffect, useRef } from 'react';
import { cellsOf, PIECES, type PieceKind } from '@/lib/games/stacker/engine';
import { PIECE_COLORS } from './piece-colors';
import { canvasDpr, drawConnected } from './block-paint';

/** A piece drawn in miniature, for the next queue and the hold slot. */
export default function PieceChip({ kind, label, dim, size = 15 }: { kind: PieceKind | null; label?: string; dim?: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = canvasDpr();
    canvas.width = size * 4 * dpr;
    canvas.height = size * 2 * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size * 4, size * 2);
    if (!kind) return;

    const color = PIECE_COLORS[PIECES.indexOf(kind) + 1] ?? '#fff';
    const cells = cellsOf({ kind, x: 0, y: 0, rotation: 0 });
    const xs = cells.map(([x]) => x);
    const ys = cells.map(([, y]) => y);
    const offsetX = (4 - (Math.max(...xs) - Math.min(...xs) + 1)) / 2 - Math.min(...xs);
    const offsetY = (2 - (Math.max(...ys) - Math.min(...ys) + 1)) / 2 - Math.min(...ys);
    const member = new Set(cells.map(([x, y]) => `${x},${y}`));

    ctx.globalAlpha = dim ? 0.45 : 1;
    for (const [x, y] of cells) {
      drawConnected(ctx, (x + offsetX) * size, (y + offsetY) * size, size, color, {
        up: member.has(`${x},${y - 1}`),
        down: member.has(`${x},${y + 1}`),
        left: member.has(`${x - 1},${y}`),
        right: member.has(`${x + 1},${y}`),
      }, false);
    }
    ctx.globalAlpha = 1;
  }, [kind, dim, size]);

  return (
    <div className="text-center">
      {label && <div className="text-[9px] uppercase tracking-[0.12em] text-lc-muted">{label}</div>}
      <canvas
        ref={ref}
        style={{ width: size * 4, height: size * 2 }}
        className="mt-0.5"
        data-testid={label ? `chip-${label.toLowerCase()}` : 'chip'}
      />
    </div>
  );
}
