import { orbCircles } from '@/utils/games/new-game/preview-geometry';

/** One to three orbs in a preview cell. */
export default function OrbGroup({ x, y, cell, count, color }: { x: number; y: number; cell: number; count: number; color: string }) {
  return (
    <g>
      {orbCircles(x, y, cell, count).map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill={color} />
      ))}
    </g>
  );
}
