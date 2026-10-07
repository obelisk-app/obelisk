import { useTranslations } from 'next-intl';
import { chainReactionPreview } from '@/utils/games/new-game/preview-geometry';
import OrbGroup from './OrbGroup';

/** Picker thumbnail for Chain Reaction, ported from the classic stack. */
export default function ChainReactionPreview({ size = 56 }: { size?: number }) {
  const t = useTranslations();
  const { cell, cells } = chainReactionPreview(size);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={t('games.chainPreview')}
      className="shrink-0"
    >
      <rect x={0} y={0} width={size} height={size} rx={4} ry={4} fill="#0a0a0a" />
      {cells.map((c, i) => (
        <g key={i}>
          <rect x={c.x} y={c.y} width={cell} height={cell} rx={2} ry={2} fill="#171717" stroke="#262626" strokeWidth={0.5} />
          {c.orbs && <OrbGroup x={c.x} y={c.y} cell={cell} count={c.orbs.count} color={c.orbs.color} />}
        </g>
      ))}
    </svg>
  );
}
