import type { ReactNode } from 'react';
import PersonGlyph from './PersonGlyph';
import CommunityGlyph from './CommunityGlyph';

/**
 * One row of the comparison: you, an arrow to the box in the middle, an arrow
 * to your community. The middle box's contents come in as children; `lit`
 * draws the Obelisk row in the accent colour with moving arrows, the other
 * row dimmed.
 */
export default function Lane({ y, label, you, sent, community, lit, badge, children }: {
  y: number; label: string; you: string; sent: string; community: string; lit: boolean; badge?: ReactNode; children: ReactNode;
}) {
  const ink = lit ? '#b4f953' : '#737373';
  const text = lit ? '#fafafa' : '#a3a3a3';
  const arrow = lit ? 'url(#how-arrow)' : 'url(#how-arrow-dim)';
  const flow = lit ? 'animate-dash-flow' : undefined;
  return (
    <g>
      <text x="24" y={y - 54} fontSize="11.5" fontWeight="700" fill={ink} fontFamily="monospace" letterSpacing="1.5">
        {label}
      </text>
      <PersonGlyph cx={95} cy={y - 6} color={ink} />
      {badge}
      <text x="95" y={y + 40} textAnchor="middle" fontSize="14" fontWeight="700" fill={text}>{you}</text>

      <line x1="150" y1={y} x2="262" y2={y} stroke={ink} strokeWidth="2" strokeDasharray={lit ? '6 6' : undefined}
        className={flow} markerEnd={arrow} />
      <text x="206" y={y - 10} textAnchor="middle" fontSize="12" fontWeight={lit ? 700 : 400} fill={ink}>{sent}</text>

      {children}

      <line x1="552" y1={y} x2="646" y2={y} stroke={ink} strokeWidth="2" strokeDasharray={lit ? '6 6' : undefined}
        className={flow} markerEnd={arrow} />
      <CommunityGlyph cx={705} cy={y - 6} color={ink} />
      <text x="705" y={y + 40} textAnchor="middle" fontSize="14" fontWeight="700" fill={text}>{community}</text>
    </g>
  );
}
