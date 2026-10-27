import { useTranslations } from 'next-intl';
import KeyCard from '../how-it-works/KeyCard';
import BrowserApp from '../how-it-works/BrowserApp';
import ServerRelay from '../how-it-works/ServerRelay';
import Elsewhere from '../how-it-works/Elsewhere';

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

      <KeyCard />
      <BrowserApp />
      <ServerRelay />
      <Elsewhere />

      {/* key -> app: the key signs, the app never holds it */}
      <line x1="216" y1="125" x2="268" y2="125" stroke="#b4f953" strokeWidth="2" strokeDasharray="5 5"
        className="animate-dash-flow" markerEnd="url(#how-arrow)" />
      <rect x="216" y="96" width="52" height="20" rx="10" fill="#b4f953" />
      <text x="242" y="110" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0a0a0a">
        {t('guides.art.howObeliskWorks.sign')}
      </text>

      {/* app <-> server: signed events, straight over a WebSocket */}
      <line x1="490" y1="125" x2="612" y2="125" stroke="#b4f953" strokeWidth="2" strokeDasharray="6 6"
        className="animate-dash-flow" markerStart="url(#how-arrow)" markerEnd="url(#how-arrow)" />
      <text x="551" y="113" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953">
        {t('guides.art.howObeliskWorks.flowSigned')}
      </text>
      <text x="551" y="145" textAnchor="middle" fontSize="11" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.flowSocket')}
      </text>

      {/* app -> what it reaches on its own: other relays, voice, the wallet */}
      <g stroke="#8bc34a" strokeWidth="1.5" fill="none" strokeDasharray="4 6" opacity="0.85">
        <path d="M362 210 C 362 248, 138 244, 138 280" className="animate-dash-flow" markerEnd="url(#how-arrow)" />
        <path d="M378 210 L 400 280" className="animate-dash-flow" markerEnd="url(#how-arrow)" />
        <path d="M394 210 C 394 248, 662 244, 662 280" className="animate-dash-flow" markerEnd="url(#how-arrow)" />
      </g>

      <text x="400" y="384" textAnchor="middle" fontSize="12.5" fontWeight="700" fill="#b4f953">
        {t('guides.art.howObeliskWorks.noServer')}
      </text>
    </svg>
  );
}
