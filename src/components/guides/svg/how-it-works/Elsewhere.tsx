import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

const DIM = '#5c7a2e';
const RELAYS = [
  { cx: 662, cy: 110, r: 20 },
  { cx: 736, cy: 138, r: 18 },
  { cx: 692, cy: 186, r: 22 },
  { cx: 614, cy: 166, r: 16 },
  { cx: 756, cy: 206, r: 14 },
];

/**
 * What the app reaches on its own, beside the group's server: other Nostr
 * relays for profiles and DMs, voice (peer to peer, or an SFU the channel
 * admin picks) and the Lightning wallet that pays zaps.
 */
export default function Elsewhere() {
  const t = useTranslations();

  return (
    <g>
      {RELAYS.map((n, i) => (
        <g key={i}>
          <circle cx={n.cx} cy={n.cy} r={n.r} fill="#171717" stroke="#b4f953" strokeWidth="1.5" />
          <circle
            cx={n.cx} cy={n.cy} r={n.r - 8} fill="#b4f953" opacity="0.5"
            className="animate-dot-pulse"
            style={{ transformOrigin: `${n.cx}px ${n.cy}px`, animationDelay: `${i * 0.4}s` } as React.CSSProperties}
          />
        </g>
      ))}
      <text x="686" y="248" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.relays')}
      </text>
      <text x="686" y="264" textAnchor="middle" fontSize="10" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.relayRoles')}
      </text>

      <Pill y={284} h={54} icon={<VoiceGlyph />}>
        <text x="606" y="301" fontSize="11.5" fontWeight="700" fill="#fafafa">{t('guides.art.howObeliskWorks.voice')}</text>
        <text x="606" y="316" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.voiceMesh')}</text>
        <text x="606" y="329" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.voiceSfu')}</text>
      </Pill>
      <Pill y={346} h={42} icon={<BoltGlyph />}>
        <text x="606" y="363" fontSize="11.5" fontWeight="700" fill="#fafafa">{t('guides.art.howObeliskWorks.wallet')}</text>
        <text x="606" y="378" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.walletDoes')}</text>
      </Pill>
    </g>
  );
}

function Pill({ y, h, icon, children }: { y: number; h: number; icon: ReactNode; children: ReactNode }) {
  const cy = y + h / 2;
  return (
    <g>
      <rect x="556" y={y} width="228" height={h} rx="10" fill="#0f0f0f" stroke={DIM} strokeWidth="1.4" />
      <rect x="566" y={cy - 14} width="28" height="28" rx="7" fill="#2d3a1a" />
      <g transform={`translate(580 ${cy})`}>{icon}</g>
      {children}
    </g>
  );
}

/** Three peers meshed together. */
function VoiceGlyph() {
  const peers: [number, number][] = [[0, -7], [-7, 5], [7, 5]];
  return (
    <g>
      <path d="M0 -7 L-7 5 L7 5 Z" fill="none" stroke="#b4f953" strokeWidth="1.1" opacity="0.8" />
      {peers.map(([cx, cy]) => (
        <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="2.8" fill="#b4f953" />
      ))}
    </g>
  );
}

function BoltGlyph() {
  return <polygon points="2,-9 -5,1 -1,1 -2,9 5,-2 1,-2" fill="#b4f953" />;
}
