/**
 * The Obelisco, small: the community's relay. Same silhouette as
 * src/assets/brand/ObeliskIcon.tsx, the 512 viewBox scaled to about 55 units tall
 * with its tip at (x, y).
 */
export default function MiniObelisk({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <g transform={`translate(${x - 256 * 0.12} ${y - 16 * 0.12}) scale(0.12)`}>
        <path d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z" fill="#8bc34a" opacity="0.85" />
        <path d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z" fill="url(#how-obelisk-body)" />
      </g>
      <rect x={x - 11} y={y + 54} width="22" height="4" fill="#8bc34a" />
    </g>
  );
}
