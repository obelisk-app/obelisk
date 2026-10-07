import { useTranslations } from 'next-intl';

/**
 * The community's server, drawn as the Obelisco: in Obelisk the "server"
 * (what the app's Server settings configure) is the NIP-29 relay itself. It
 * stores the channels, messages and roles and enforces the group's rules.
 * The silhouette's paths match src/components/ObeliskIcon.tsx; the 512 viewBox
 * is scaled so the tip sits at (410, 84) and the base at (410, 259).
 */
export default function ServerRelay() {
  const t = useTranslations();

  return (
    <g>
      <circle cx="410" cy="180" r="110" fill="url(#how-server-glow)"
        className="animate-glow-pulse"
        style={{ transformOrigin: '410px 180px', transformBox: 'fill-box' } as React.CSSProperties}
      />
      <g transform="translate(309.9 77.7) scale(0.391)">
        <path d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z" fill="#8bc34a" opacity="0.85" />
        <path d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z" fill="url(#how-obelisk-body)" />
      </g>
      <rect x="382" y="259" width="56" height="8" fill="#8bc34a" />
      <rect x="372" y="267" width="76" height="6" fill="#2d3a1a" />

      <text x="410" y="298" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.server')}
      </text>
      <text x="410" y="315" textAnchor="middle" fontSize="10.5" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.serverRoles')}
      </text>
      <text x="410" y="331" textAnchor="middle" fontSize="10" fontWeight="600" fill="#b4f953">
        {t('guides.art.howObeliskWorks.serverDoes')}
      </text>
    </g>
  );
}
