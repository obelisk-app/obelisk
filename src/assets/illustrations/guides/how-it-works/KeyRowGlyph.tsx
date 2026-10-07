/** The tiny line icon on a key row: an extension, a phone, or a lock. */
export default function KeyRowGlyph({ kind, x, y }: { kind: 'ext' | 'phone' | 'lock'; x: number; y: number }) {
  const stroke = { stroke: '#b4f953', strokeWidth: 1.2, fill: 'none', strokeLinecap: 'round' as const };
  if (kind === 'ext') {
    return (
      <g {...stroke}>
        <rect x={x - 6} y={y - 4.5} width="12" height="9" rx="1.5" />
        <line x1={x - 6} y1={y - 1.5} x2={x + 6} y2={y - 1.5} />
      </g>
    );
  }
  if (kind === 'phone') {
    return (
      <g {...stroke}>
        <rect x={x - 4} y={y - 6} width="8" height="12" rx="1.5" />
        <line x1={x - 1} y1={y + 3.5} x2={x + 1} y2={y + 3.5} />
      </g>
    );
  }
  return (
    <g {...stroke}>
      <rect x={x - 5} y={y - 1} width="10" height="7" rx="1.5" />
      <path d={`M${x - 3} ${y - 1} v-2 a3 3 0 0 1 6 0 v2`} />
    </g>
  );
}
