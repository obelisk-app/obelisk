/** A key, drawn in lines. */
export default function KeyGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="#b4f953" strokeWidth="1.6" fill="none" strokeLinecap="round">
      <circle cx={x - 4} cy={y} r="4.5" />
      <line x1={x + 1} y1={y} x2={x + 10} y2={y} />
      <line x1={x + 7} y1={y} x2={x + 7} y2={y + 4} />
    </g>
  );
}
