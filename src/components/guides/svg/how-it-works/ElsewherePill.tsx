import type { ReactNode } from 'react';

const DIM = '#5c7a2e';

/** A rounded card on the right: an icon tile and the lines passed in as children. */
export default function ElsewherePill({ y, h, icon, children }: { y: number; h: number; icon: ReactNode; children: ReactNode }) {
  const cy = y + h / 2;
  return (
    <g>
      <rect x="556" y={y} width="228" height={h} rx="10" fill="#0f0f0f" stroke={DIM} strokeWidth="1.4" />
      <rect x="566" y={cy - 14} width="28" height="28" rx="7" fill="#2d3a1a" />
      <g transform={`translate(580 ${cy})`}>{icon}</g>
      {children}
    </g>
  );
}
