import { useTranslations } from 'next-intl';
import { vestaPreview } from '@/utils/games/new-game/preview-geometry';

/** Picker thumbnail for Vesta, in the live board's resource palette. */
export default function VestaPreview({ size = 56 }: { size?: number }) {
  const t = useTranslations();
  const { hexes, road, settlements } = vestaPreview(size);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t('games.vestaPreview')}
      className="shrink-0"
    >
      <rect x={0} y={0} width={size} height={size} rx={4} ry={4} fill="#0a1628" />
      {hexes.map((hex, i) => (
        <polygon key={i} points={hex.points} fill={hex.fill} stroke="#0a0a0a" strokeWidth={0.8} />
      ))}
      <line
        x1={road.x1} y1={road.y1} x2={road.x2} y2={road.y2}
        stroke={road.color} strokeWidth={road.width} strokeLinecap="round"
      />
      {settlements.map((s, i) => (
        <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill={s.fill} stroke="#fff" strokeWidth={0.8} />
      ))}
    </svg>
  );
}
