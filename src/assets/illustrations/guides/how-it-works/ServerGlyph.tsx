/** A server: three stacked units with their lights. */
export default function ServerGlyph({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g stroke={color} strokeWidth="1.8" fill="none">
      {[0, 12, 24].map((dy) => (
        <g key={dy}>
          <rect x={x} y={y + dy} width="30" height="9" rx="2" />
          <circle cx={x + 6} cy={y + dy + 4.5} r="1.3" fill={color} stroke="none" />
        </g>
      ))}
    </g>
  );
}
