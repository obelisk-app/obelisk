import { useTranslations } from 'next-intl';
import ElsewherePill from './ElsewherePill';
import VoiceGlyph from './VoiceGlyph';
import BoltGlyph from './BoltGlyph';

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

      <ElsewherePill y={284} h={54} icon={<VoiceGlyph />}>
        <text x="606" y="301" fontSize="11.5" fontWeight="700" fill="#fafafa">{t('guides.art.howObeliskWorks.voice')}</text>
        <text x="606" y="316" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.voiceMesh')}</text>
        <text x="606" y="329" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.voiceSfu')}</text>
      </ElsewherePill>
      <ElsewherePill y={346} h={42} icon={<BoltGlyph />}>
        <text x="606" y="363" fontSize="11.5" fontWeight="700" fill="#fafafa">{t('guides.art.howObeliskWorks.wallet')}</text>
        <text x="606" y="378" fontSize="9.5" fill="#a3a3a3">{t('guides.art.howObeliskWorks.walletDoes')}</text>
      </ElsewherePill>
    </g>
  );
}
