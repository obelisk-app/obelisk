import { useTranslations } from 'next-intl';

/**
 * The community's server, drawn as the Obelisco: in Obelisk the "server"
 * (what the app's Server settings configure) is the NIP-29 relay itself. It
 * stores the channels, messages and roles and enforces the group's rules.
 * The silhouette's paths match src/assets/brand/ObeliskIcon.tsx; the 512
 * viewBox is scaled so the tip sits at (690, 30) and the base at (690, 151).
 */
export default function ServerRelay() {
  const t = useTranslations();

  return (
    <g>
      <circle cx="690" cy="100" r="92" fill="url(#how-server-glow)"
        className="animate-glow-pulse"
        style={{ transformOrigin: '690px 100px', transformBox: 'fill-box' } as React.CSSProperties}
      />
      <g transform="translate(620.9 25.7) scale(0.27)">
        <path d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z" fill="#8bc34a" opacity="0.85" />
        <path d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z" fill="url(#how-obelisk-body)" />
      </g>
      <rect x="666" y="151" width="48" height="7" fill="#8bc34a" />
      <rect x="658" y="158" width="64" height="5" fill="#2d3a1a" />

      <text x="690" y="184" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.server')}
      </text>
      <text x="690" y="202" textAnchor="middle" fontSize="12" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.serverRoles')}
      </text>
      <text x="690" y="220" textAnchor="middle" fontSize="10" fontWeight="600" fill="#b4f953">
        {t('guides.art.howObeliskWorks.serverDoes')}
      </text>
    </g>
  );
}
