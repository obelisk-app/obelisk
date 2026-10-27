import type { ReactNode } from 'react';

const DIM = '#5c7a2e';

/** A card in the bottom row: an icon tile and the lines passed in as children. */
export default function ElsewherePill({ x, w, icon, children }: { x: number; w: number; icon: ReactNode; children: ReactNode }) {
  return (
    <g>
      <rect x={x} y="282" width={w} height="72" rx="10" fill="#0f0f0f" stroke={DIM} strokeWidth="1.4" />
      <rect x={x + 12} y="302" width="32" height="32" rx="8" fill="#2d3a1a" />
      <g transform={`translate(${x + 28} 318)`}>{icon}</g>
      {children}
    </g>
  );
}
