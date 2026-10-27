import { useTranslations } from 'next-intl';
import BrowserRowGlyph from './BrowserRowGlyph';

const DIM = '#5c7a2e';

/**
 * The Obelisk web app as it runs: a browser window holding the app, and the
 * app's one connection manager (the RelayHub), which owns every relay socket
 * the page opens.
 */
export default function BrowserApp() {
  const t = useTranslations();

  return (
    <g>
      <rect x="270" y="40" width="216" height="170" rx="12" fill="#0f0f0f" stroke="#b4f953" strokeWidth="1.6" />
      <path d="M270 64 V52 a12 12 0 0 1 12 -12 H474 a12 12 0 0 1 12 12 V64 Z" fill="#1a1a1a" />
      <line x1="270" y1="64" x2="486" y2="64" stroke="#262626" strokeWidth="1" />
      {[286, 298, 310].map((cx) => (
        <circle key={cx} cx={cx} cy="52" r="3.2" fill={DIM} />
      ))}
      <text x="324" y="56" fontSize="11" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.browser')}
      </text>

      <rect x="286" y="86" width="32" height="32" rx="8" fill="#2d3a1a" />
      <BrowserRowGlyph x={302} y={101} />
      <text x="328" y="99" fontSize="15" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.app')}
      </text>
      <text x="328" y="117" fontSize="12" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.appSub')}
      </text>

      {/* the connection manager every relay request goes through */}
      <line x1="286" y1="160" x2="470" y2="160" stroke="#262626" strokeWidth="1" />
      <circle cx="294" cy="183" r="6" fill="none" stroke="#b4f953" strokeWidth="1.3" />
      <circle
        cx="294" cy="183" r="2.6" fill="#b4f953"
        className="animate-dot-pulse"
        style={{ transformOrigin: '294px 183px' } as React.CSSProperties}
      />
      <text x="306" y="187" fontSize="10" fontWeight="700" fill="#b4f953">
        {t('guides.art.howObeliskWorks.hub')}
      </text>
    </g>
  );
}
