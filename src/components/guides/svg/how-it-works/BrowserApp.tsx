import { useTranslations } from 'next-intl';

const DIM = '#5c7a2e';

/**
 * The Obelisk web app as it runs: one browser window holding the static
 * pages and the app, and the app's one connection manager (the RelayHub),
 * which owns every relay socket the page opens.
 */
export default function BrowserApp() {
  const t = useTranslations();

  return (
    <g>
      <rect x="16" y="160" width="236" height="150" rx="12" fill="#0f0f0f" stroke="#b4f953" strokeWidth="1.6" />
      <path d="M16 184 V172 a12 12 0 0 1 12 -12 H240 a12 12 0 0 1 12 12 V184 Z" fill="#1a1a1a" />
      <line x1="16" y1="184" x2="252" y2="184" stroke="#262626" strokeWidth="1" />
      {[32, 44, 56].map((cx) => (
        <circle key={cx} cx={cx} cy="172" r="3.2" fill={DIM} />
      ))}
      <text x="70" y="176" fontSize="10" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.browser')}
      </text>

      <AppRow y={192} title={t('guides.art.howObeliskWorks.pages')} sub={t('guides.art.howObeliskWorks.pagesSub')} glyph="page" />
      <AppRow y={238} title={t('guides.art.howObeliskWorks.app')} sub={t('guides.art.howObeliskWorks.appSub')} glyph="chat" lit />

      {/* the connection manager every relay request goes through */}
      <circle cx="34" cy="294" r="6" fill="none" stroke="#b4f953" strokeWidth="1.3" />
      <circle
        cx="34" cy="294" r="2.6" fill="#b4f953"
        className="animate-dot-pulse"
        style={{ transformOrigin: '34px 294px' } as React.CSSProperties}
      />
      <text x="46" y="298" fontSize="10" fontWeight="700" fill="#b4f953">
        {t('guides.art.howObeliskWorks.hub')}
      </text>
    </g>
  );
}

function AppRow({ y, title, sub, glyph, lit = false }: { y: number; title: string; sub: string; glyph: 'page' | 'chat'; lit?: boolean }) {
  return (
    <g>
      <rect x="24" y={y} width="220" height="40" rx="8" fill="#141414" stroke={lit ? '#b4f953' : DIM} strokeWidth="1.2" />
      <rect x="32" y={y + 7} width="26" height="26" rx="6" fill="#2d3a1a" />
      <RowGlyph kind={glyph} x={45} y={y + 20} />
      <text x="66" y={y + 17} fontSize="11.5" fontWeight="700" fill="#fafafa">
        {title}
      </text>
      <text x="66" y={y + 31} fontSize="9.5" fill="#a3a3a3">
        {sub}
      </text>
    </g>
  );
}

function RowGlyph({ kind, x, y }: { kind: 'page' | 'chat'; x: number; y: number }) {
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
