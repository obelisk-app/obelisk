/**
 * The illustration on a page's preview card: one simple line drawing per
 * page, in the brand green, on the card's dark tile. Plain SVG shapes only,
 * which is what the image renderer (satori) draws.
 */

import type { OgIconName } from '@/utils/seo/cards';

const G = '#b4f953';
const D = '#8bc34a';
const S = { fill: 'none', stroke: G, strokeWidth: 8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Plain function, not a component: the image renderer gets finished elements. */
function shapes(name: OgIconName) {
  switch (name) {
    case 'landing':
      return (<g><polygon points="100,18 128,170 72,170" fill={G} /><rect x="60" y="170" width="80" height="12" fill={D} /></g>);
    case 'app':
      return (<g><rect x="24" y="36" width="112" height="78" rx="18" {...S} /><path d="M56 114 L48 140 L82 114" {...S} /><rect x="76" y="92" width="100" height="70" rx="18" {...S} stroke={D} /></g>);
    case 'voice':
      return (<g><rect x="74" y="28" width="52" height="92" rx="26" {...S} /><path d="M46 96 C46 150 154 150 154 96 M100 146 L100 176 M70 176 L130 176" {...S} /></g>);
    case 'features':
      return (<g><rect x="30" y="30" width="60" height="60" rx="12" {...S} /><rect x="110" y="30" width="60" height="60" rx="12" {...S} stroke={D} /><rect x="30" y="110" width="60" height="60" rx="12" {...S} stroke={D} /><rect x="110" y="110" width="60" height="60" rx="12" {...S} /></g>);
    case 'desktop':
      return (<g><rect x="20" y="36" width="160" height="104" rx="10" {...S} /><path d="M100 140 L100 168 M64 170 L136 170" {...S} /><path d="M40 60 L80 60 M40 82 L120 82 M40 104 L100 104" {...S} stroke={D} /></g>);
    case 'mobile':
      return (<g><rect x="58" y="16" width="84" height="168" rx="16" {...S} /><path d="M86 160 L114 160" {...S} /><path d="M76 50 L124 50 M76 74 L112 74 M76 98 L120 98" {...S} stroke={D} /></g>);
    case 'help':
      return (<g><circle cx="100" cy="100" r="76" {...S} /><path d="M74 78 C74 46 128 46 128 78 C128 100 100 102 100 124" {...S} /><circle cx="100" cy="150" r="7" fill={G} /></g>);
    case 'helpLocalData':
      return (<g><ellipse cx="100" cy="44" rx="64" ry="20" {...S} /><path d="M36 44 L36 150 C36 178 164 178 164 150 L164 44 M36 97 C36 125 164 125 164 97" {...S} /><path d="M82 140 L96 154 L124 126" {...S} stroke={D} /></g>);
    case 'mediaKit':
      return (<g><rect x="22" y="34" width="156" height="132" rx="14" {...S} /><circle cx="66" cy="76" r="16" {...S} stroke={D} /><path d="M34 150 L84 104 L118 136 L140 116 L170 146" {...S} /></g>);
    case 'guides':
      return (<g><path d="M100 50 C76 34 44 34 22 42 L22 164 C44 156 76 156 100 172 C124 156 156 156 178 164 L178 42 C156 34 124 34 100 50 Z" {...S} /><path d="M100 50 L100 172" {...S} stroke={D} /></g>);
    case 'note':
      return (<g><path d="M30 40 L170 40 L170 136 L92 136 L56 168 L60 136 L30 136 Z" {...S} /><path d="M56 72 L144 72 M56 102 L120 102" {...S} stroke={D} /></g>);
    case 'profile':
      return (<g><circle cx="100" cy="70" r="38" {...S} /><path d="M32 176 C38 128 162 128 168 176" {...S} /></g>);
    case 'tag':
      return (<path d="M76 30 L60 170 M140 30 L124 170 M38 74 L172 74 M28 126 L162 126" {...S} />);
  }
}

/** Called as a function by `OgCard`, so the renderer receives plain elements. */
export default function OgIcon({ name }: { name: OgIconName }) {
  return (
    <svg width="200" height="200" viewBox="0 0 200 200">
      {shapes(name)}
    </svg>
  );
}
