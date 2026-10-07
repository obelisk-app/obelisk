import { useTranslations } from 'next-intl';
import ServerSettingsPanel from '../admin-cli/ServerSettingsPanel';
import ChannelSettingsPanel from '../admin-cli/ChannelSettingsPanel';

/**
 * The admin-cli guide's hero. The slug is older than the guide: the CLI is
 * gone, and the art shows what replaced it, the app's own admin tools. The
 * operator's server settings (left) publish NIP-78 events, a channel admin's
 * settings (middle) publish NIP-29 events, and the relay checks both.
 */
export default function AdminCliHero() {
  const t = useTranslations();

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-cli-title hero-cli-desc"
      className="w-full h-auto"
    >
      <title id="hero-cli-title">{t('guides.art.adminCli.title')}</title>
      <desc id="hero-cli-desc">{t('guides.art.adminCli.desc')}</desc>

      <defs>
        <linearGradient id="sky-cli" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#0f1a08" />
        </linearGradient>
        <radialGradient id="relay-glow-cli" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-cli)" />

      {/* faint grid */}
      <g opacity="0.1" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
      </g>

      {/* flows: operator events arc over to the relay, channel events go straight */}
      <g stroke="#b4f953" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9">
        <path d="M145 64 C 220 8, 620 8, 695 146" strokeDasharray="4 10" className="animate-dash-flow" />
        <line
          x1="525" y1="200" x2="640" y2="200"
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '0.4s' } as React.CSSProperties}
        />
      </g>
      <g fontFamily="monospace" fontSize="10" fontWeight="700" fill="#b4f953" textAnchor="middle">
        <text x="420" y="24">NIP-78</text>{/* i18n-exempt: protocol name */}
        <text x="582" y="190">NIP-29</text>{/* i18n-exempt: protocol name */}
      </g>

      <ServerSettingsPanel />
      <ChannelSettingsPanel />

      {/* the relay that checks and enforces both */}
      <g>
        <circle cx="695" cy="200" r="70" fill="url(#relay-glow-cli)"
          className="animate-glow-pulse"
          style={{ transformOrigin: '695px 200px', transformBox: 'fill-box' } as React.CSSProperties}
        />
        <rect x="640" y="146" width="110" height="110" rx="12" fill="#171717" stroke="#b4f953" strokeWidth="1.6" />
        <polygon points="695,164 683,232 707,232" fill="#b4f953" opacity="0.85" />
        <rect x="678" y="232" width="34" height="4" fill="#b4f953" opacity="0.7" />
        <text x="695" y="278" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fafafa">
          {t('guides.art.adminCli.relay')}
        </text>
        <text x="695" y="294" textAnchor="middle" fontSize="10" fill="#b4f953">
          {t('guides.art.adminCli.enforces')}
        </text>
      </g>

      {/* legend + badge */}
      <g fontSize="10.5" fontWeight="600">
        <rect x="30" y="360" width="12" height="12" rx="2" fill="#b4f953" />
        <text x="48" y="370" fill="#fafafa">{t('guides.art.adminCli.legendOperator')}</text>
        <rect x="285" y="360" width="12" height="12" rx="2" fill="#171717" stroke="#5c7a2e" strokeWidth="1.5" />
        <text x="303" y="370" fill="#fafafa">{t('guides.art.adminCli.legendAdmin')}</text>
      </g>
      <g>
        <rect x="560" y="352" width="210" height="26" rx="13" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.5" />
        <text x="665" y="369" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#b4f953">
          {t('guides.art.adminCli.signed')}
        </text>
      </g>
    </svg>
  );
}
