/**
 * Stacker: two wells, and the only thing that travels between them. Clearing
 * lines does not score points here - it sends rows, so the hero draws the
 * attack crossing the gap rather than a scoreboard.
 */

import { useTranslations } from 'next-intl';
import {
  STACKER_CELL as CELL, STACKER_COLS as COLS, STACKER_ROWS as ROWS, STACKER_TOP as TOP,
  STACKER_LEFT as LEFT, STACKER_RIGHT as RIGHT,
} from '@/utils/guides/stacker-art';
import StackerWell from './StackerWell';

export default function StackerHero() {
  const t = useTranslations();
  const leftX = 96;
  const rightX = 484;
  const bottom = TOP + ROWS * CELL;

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-stacker-title hero-stacker-desc"
      className="w-full h-auto"
    >
      <title id="hero-stacker-title">{t('guides.art.stacker.title')}</title>
      <desc id="hero-stacker-desc">{t('guides.art.stacker.desc')}</desc>

      <defs>
        <radialGradient id="bg-stacker" cx="0.5" cy="0.5" r="0.78">
          <stop offset="0%" stopColor="#12161a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#bg-stacker)" />

      <StackerWell x={leftX} blocks={LEFT} clearRow={8} />
      <StackerWell x={rightX} blocks={RIGHT} garbageRows={[6, 7, 8]} />

      {/* the attack: three lines and the column they leave open */}
      <path
        d={`M${leftX + COLS * CELL + 12} ${bottom - CELL / 2} C 380 ${bottom - CELL / 2}, 390 ${TOP + 4 * CELL}, ${rightX - 18} ${TOP + 6 * CELL + CELL / 2}`}
        fill="none"
        stroke="#b4f953"
        strokeOpacity="0.85"
        strokeWidth="2.5"
        strokeDasharray="7 6"
      />
      <polygon
        points={`${rightX - 18},${TOP + 6 * CELL + CELL / 2 - 6} ${rightX - 4},${TOP + 6 * CELL + CELL / 2} ${rightX - 18},${TOP + 6 * CELL + CELL / 2 + 6}`}
        fill="#b4f953"
      />

      <g fontWeight="600">
        <text x={leftX} y="72" fill="#fafafa" fontSize="15">{t('guides.art.stacker.clear')}</text>
        <text x={rightX} y="72" fill="#fafafa" fontSize="15">{t('guides.art.stacker.digs')}</text>

        <g fontFamily="ui-monospace, monospace">
          <rect x="336" y="176" width="132" height="52" rx="9" fill="#171717" stroke="#262626" />
          <text x="352" y="199" fill="#b4f953" fontSize="12">op: attack</text> {/* i18n-exempt: the wire payload, drawn as code */}
          <text x="352" y="217" fill="#a3a3a3" fontSize="11">lines 3 · hole 6</text> {/* i18n-exempt: the wire payload, drawn as code */}
        </g>

        <text x={leftX} y="368" fill="#a3a3a3" fontSize="11">
          {t('guides.art.stacker.footer')}
        </text>
      </g>
    </svg>
  );
}
