import { useTranslations } from 'next-intl';
import KeyCard from './how-it-works/KeyCard';
import BrowserApp from './how-it-works/BrowserApp';
import ServerRelay from './how-it-works/ServerRelay';
import Elsewhere from './how-it-works/Elsewhere';

/**
 * The how-obelisk-works guide's hero: the architecture as the code has it.
 * The key stays with its owner and signs for the web app in the browser. The
 * app's one connection manager (the RelayHub) sends those signed events over
 * a WebSocket straight to the community's server, which is the NIP-29 relay
 * itself (the Obelisco), and reaches other Nostr relays itself for profiles
 * and DMs. Voice goes peer to peer or through an SFU; zaps are paid by the
 * person's own Lightning wallet. No Obelisk server sits in between.
 */
export default function HowObeliskWorksHero() {
  const t = useTranslations();

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-how-title hero-how-desc"
      className="w-full h-auto"
    >
      <title id="hero-how-title">{t('guides.art.howObeliskWorks.title')}</title>
      <desc id="hero-how-desc">{t('guides.art.howObeliskWorks.desc')}</desc>

      <defs>
        <linearGradient id="sky-how" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <linearGradient id="how-obelisk-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b4f953" />
          <stop offset="100%" stopColor="#8bc34a" />
        </linearGradient>
        <radialGradient id="how-server-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
        <marker id="how-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b4f953" />
        </marker>
      </defs>

      <rect width="800" height="400" fill="url(#sky-how)" />
      <g opacity="0.12" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`g${i}`} x1="0" y1={50 + i * 50} x2="800" y2={50 + i * 50} />
        ))}
      </g>

      <ServerRelay />
      <KeyCard />
      <BrowserApp />
      <Elsewhere />

      {/* app <-> server: signed events, straight over a WebSocket */}
      <path
        d="M258 292 C 300 292, 326 256, 380 256"
        stroke="#b4f953" strokeWidth="2" fill="none" strokeDasharray="6 6"
        className="animate-dash-flow"
        markerStart="url(#how-arrow)" markerEnd="url(#how-arrow)"
      />
      <text x="326" y="232" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#b4f953">
        {t('guides.art.howObeliskWorks.flowSigned')}
      </text>
      <text x="326" y="245" textAnchor="middle" fontSize="9.5" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.flowSocket')}
      </text>

      {/* app -> other relays: the app fetches profiles and DMs itself */}
      <path
        d="M256 284 C 300 0, 560 0, 640 98"
        stroke="#8bc34a" strokeWidth="1.6" fill="none" strokeDasharray="5 7" opacity="0.85"
        className="animate-dash-flow"
        style={{ animationDuration: '3s' } as React.CSSProperties}
        markerEnd="url(#how-arrow)"
      />
      <text x="482" y="30" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#8bc34a">
        {t('guides.art.howObeliskWorks.flowProfile')}
      </text>

      {/* app -> voice and wallet, outside the relays */}
      <g stroke="#8bc34a" strokeWidth="1.4" fill="none" strokeDasharray="3 6" opacity="0.8">
        <path d="M252 304 C 330 376, 480 376, 552 312" className="animate-dash-flow" markerEnd="url(#how-arrow)" />
        <path d="M252 306 C 330 396, 480 396, 552 367" className="animate-dash-flow" markerEnd="url(#how-arrow)" />
      </g>
    </svg>
  );
}
