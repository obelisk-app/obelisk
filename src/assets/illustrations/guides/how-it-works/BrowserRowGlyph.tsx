/** The tiny line icon on a browser row: a page, or a chat bubble. */
export default function BrowserRowGlyph({ kind, x, y }: { kind: 'page' | 'chat'; x: number; y: number }) {
  const stroke = { stroke: '#b4f953', strokeWidth: 1.3, fill: 'none', strokeLinecap: 'round' as const };
  if (kind === 'page') {
    return (
      <g {...stroke}>
        <rect x={x - 5} y={y - 7} width="10" height="14" rx="1.5" />
        <line x1={x - 2.5} y1={y - 2.5} x2={x + 2.5} y2={y - 2.5} />
        <line x1={x - 2.5} y1={y + 1} x2={x + 2.5} y2={y + 1} />
      </g>
    );
  }
  return (
    <g {...stroke}>
      <path d={`M${x - 7} ${y - 5} h14 v9 h-8 l-3.5 3.5 v-3.5 h-2.5 z`} />
    </g>
  );
}
