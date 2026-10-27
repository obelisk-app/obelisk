import { useTranslations } from 'next-intl';
import Lane from '../how-it-works/Lane';
import ServerGlyph from '../how-it-works/ServerGlyph';
import MiniObelisk from '../how-it-works/MiniObelisk';
import KeyGlyph from '../how-it-works/KeyGlyph';

/**
 * The how-obelisk-works guide's hero, as a comparison with the same shape on
 * both rows: you, the thing in the middle, your community. On a usual chat
 * platform the middle is the company's server, holding your account, your
 * data and its rules. In Obelisk you sign with your own key and the middle is
 * your community's relay (the NIP-29 relay, drawn as the Obelisco), which the
 * community picks or runs. The app only signs and shows: no Obelisk server in
 * between. The architecture's details are the guide's text.
 */
export default function HowObeliskWorksHero() {
  const t = useTranslations();
  const k = (key: string) => t(`guides.art.howObeliskWorks.${key}` as Parameters<typeof t>[0]);

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
          <stop offset="100%" stopColor="#141c0c" />
        </linearGradient>
        <linearGradient id="how-obelisk-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b4f953" />
          <stop offset="100%" stopColor="#8bc34a" />
        </linearGradient>
        <radialGradient id="how-server-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
        <marker id="how-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b4f953" />
        </marker>
        <marker id="how-arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#737373" />
        </marker>
      </defs>

      <rect width="800" height="400" fill="url(#sky-how)" />

      {/* A usual chat platform: the company's server sits in the middle. */}
      <Lane y={108} label={k('laneUsual')} you={k('you')} sent={k('sent')} community={k('community')} lit={false}>
        <rect x="268" y="66" width="280" height="84" rx="12" fill="#141414" stroke="#404040" strokeWidth="1.6" />
        <ServerGlyph x={288} y={92} color="#737373" />
        <text x="334" y="101" fontSize="14.5" fontWeight="700" fill="#d4d4d4">{k('company')}</text>
        <text x="334" y="122" fontSize="11.5" fill="#f87171">{k('companyHas')}</text>
      </Lane>

      <line x1="24" y1="190" x2="776" y2="190" stroke="#262626" strokeWidth="1" strokeDasharray="4 6" />

      {/* Obelisk: you sign with your key; the middle is your community's relay. */}
      <Lane
        y={282} label={k('laneObelisk')} you={k('youKey')} sent={k('signed')} community={k('community')} lit
        badge={(
          <g>
            <circle cx="120" cy="294" r="12" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.6" />
            <KeyGlyph x={121} y={294} />
          </g>
        )}
      >
        <circle cx="300" cy="282" r="54" fill="url(#how-server-glow)"
          className="animate-glow-pulse"
          style={{ transformOrigin: '300px 282px', transformBox: 'fill-box' } as React.CSSProperties}
        />
        <rect x="268" y="236" width="280" height="92" rx="12" fill="#0f160a" stroke="#b4f953" strokeWidth="1.8" />
        <MiniObelisk x={300} y={250} />
        <text x="334" y="268" fontSize="14.5" fontWeight="700" fill="#fafafa">{k('relay')}</text>
        <text x="334" y="289" fontSize="11.5" fill="#b4f953">{k('relayPick')}</text>
        <text x="334" y="306" fontSize="11.5" fill="#b4f953">{k('relayRun')}</text>
      </Lane>

      <text x="400" y="378" textAnchor="middle" fontSize="13" fontWeight="700" fill="#b4f953">
        {k('footer')}
      </text>
    </svg>
  );
}
