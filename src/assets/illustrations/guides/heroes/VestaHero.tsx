/**
 * Vesta: an island of resource tiles, and the one thing that is different
 * about playing it on a relay - the dice are not rolled by the roller. The
 * hero pairs the board with the line of the log those numbers come from.
 */

import { useTranslations } from 'next-intl';
import { vestaSettlements, vestaTiles } from '@/utils/guides/hero-art';

const RESOURCES = [
  { hex: '#15803d', label: '10' }, // lumber
  { hex: '#b45309', label: '5' },  // brick
  { hex: '#a8a29e', label: '8' },  // wool
  { hex: '#ca8a04', label: '6' },  // grain
  { hex: '#57534e', label: '9' },  // ore
  { hex: '#15803d', label: '4' },
  { hex: '#d6bd8a', label: '' },   // desert
];

/** Flower layout: a centre hex plus its six neighbours, in axial coords. */
const AXIAL: Array<[number, number]> = [
  [0, 0], [1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1],
];

/** The island's tiles and the settlements on them; the numbers are worked out in `hero-art.ts`. */
const TILES = vestaTiles(AXIAL, RESOURCES);
const { ax, ay, bx, by, dx, dy } = vestaSettlements();

export default function VestaHero() {
  const t = useTranslations();
  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-vesta-title hero-vesta-desc"
      className="w-full h-auto"
    >
      <title id="hero-vesta-title">{t('guides.art.vesta.title')}</title>
      <desc id="hero-vesta-desc">{t('guides.art.vesta.desc')}</desc>

      <defs>
        <radialGradient id="bg-vesta" cx="0.4" cy="0.5" r="0.8">
          <stop offset="0%" stopColor="#101a20" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#bg-vesta)" />

      {/* the island */}
      {TILES.map((tile) => (
        <g key={tile.key}>
          <polygon
            points={tile.points}
            fill={tile.fill}
            fillOpacity="0.85"
            stroke="#b4f953"
            strokeOpacity="0.5"
            strokeWidth="2"
          />
          {tile.label && (
            <>
              <circle cx={tile.cx} cy={tile.cy} r="17" fill="#0a0a0a" fillOpacity="0.75" />
              <text
                x={tile.cx}
                y={tile.cy + 5}
                fill={tile.labelFill}
                fontSize="15"
                fontWeight="700"
                textAnchor="middle"
              >
                {tile.label}
              </text>
            </>
          )}
        </g>
      ))}

      {/* two settlements on vertices, joined by one player's road */}
      <g>
        <line x1={ax} y1={ay} x2={bx} y2={by} stroke="#e07b30" strokeWidth="7" strokeLinecap="round" />
        <rect x={ax - 9} y={ay - 9} width="18" height="18" rx="4" fill="#e07b30" stroke="#0a0a0a" strokeWidth="2" />
        <rect x={bx - 9} y={by - 9} width="18" height="18" rx="4" fill="#e07b30" stroke="#0a0a0a" strokeWidth="2" />
        <rect x={dx - 9} y={dy - 9} width="18" height="18" rx="4" fill="#3498db" stroke="#0a0a0a" strokeWidth="2" />
      </g>

      {/* where the numbers come from */}
      <g fontSize="12" fontWeight="600">
        <text x="516" y="120" fill="#fafafa" fontSize="15">{t('guides.art.vesta.headline')}</text>
        <text x="516" y="142" fill="#a3a3a3" fontSize="11">{t('guides.art.vesta.subline')}</text>

        <g fontFamily="ui-monospace, monospace">
          <rect x="516" y="164" width="236" height="30" rx="8" fill="#171717" stroke="#262626" />
          <text x="530" y="184" fill="#a3a3a3" fontSize="11">entropy = 3f9c…a12 : 14</text> {/* i18n-exempt: a log value, drawn as code */}

          <line x1="634" y1="196" x2="634" y2="216" stroke="#b4f953" strokeOpacity="0.6" strokeWidth="2" />

          <rect x="516" y="218" width="236" height="40" rx="8" fill="#171717" stroke="#b4f953" strokeOpacity="0.5" />
          <text x="536" y="244" fill="#b4f953" fontSize="17" fontWeight="700">4 + 3 = 7</text>
        </g>
        <g fontFamily="ui-monospace, monospace">
          <text x="516" y="282" fill="#a3a3a3" fontSize="11">{t('guides.art.vesta.derive')}</text>
          <text x="516" y="298" fill="#a3a3a3" fontSize="11">{t('guides.art.vesta.sameLog')}</text>
        </g>
      </g>
    </svg>
  );
}
