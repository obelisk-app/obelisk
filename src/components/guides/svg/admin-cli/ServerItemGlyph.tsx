/** A tiny line icon per tool: profile, emoji, channels, roles, members. */
export default function ServerItemGlyph({ index, x, y }: { index: number; x: number; y: number }) {
  const stroke = { stroke: '#b4f953', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round' as const };
  switch (index) {
    case 0:
      return (
        <g {...stroke}>
          <rect x={x - 7} y={y - 6} width="14" height="12" rx="2" />
          <line x1={x - 7} y1={y - 1} x2={x + 7} y2={y - 1} />
        </g>
      );
    case 1:
      return (
        <g {...stroke}>
          <circle cx={x} cy={y} r="6" />
          <path d={`M${x - 3} ${y + 2} Q${x} ${y + 5} ${x + 3} ${y + 2}`} />
        </g>
      );
    case 2:
      return (
        <g {...stroke}>
          <line x1={x - 6} y1={y - 4} x2={x + 6} y2={y - 4} />
          <line x1={x - 3} y1={y} x2={x + 6} y2={y} />
          <line x1={x - 3} y1={y + 4} x2={x + 6} y2={y + 4} />
        </g>
      );
    case 3:
      return (
        <g {...stroke}>
          <path d={`M${x} ${y - 6} L${x + 6} ${y - 2} L${x + 4} ${y + 5} L${x - 4} ${y + 5} L${x - 6} ${y - 2} Z`} />
        </g>
      );
    default:
      return (
        <g {...stroke}>
          <circle cx={x - 2} cy={y - 2} r="3" />
          <path d={`M${x - 7} ${y + 6} Q${x - 2} ${y} ${x + 3} ${y + 6}`} />
          <circle cx={x + 4} cy={y - 3} r="2" />
        </g>
      );
  }
}
