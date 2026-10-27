import { useTranslations } from 'next-intl';
import KeyGlyph from './KeyGlyph';
import KeyCardRow from './KeyCardRow';

const DIM = '#5c7a2e';

/**
 * Where the key lives: never on a server. A browser extension (NIP-07), a
 * signer app over NIP-46, or the encrypted session on this device (an nsec
 * sealed by the session vault).
 */
export default function KeyCard() {
  const t = useTranslations();
  const mono = { fontSize: 11, fill: '#b4f953', fontFamily: 'monospace', textAnchor: 'end' as const };
  return (
    <g>
      <rect x="16" y="40" width="200" height="170" rx="12" fill="#0f0f0f" stroke={DIM} strokeWidth="1.6" />
      <KeyGlyph x={36} y={64} />
      <text x="52" y="68" fontSize="12" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.key')}
      </text>
      <line x1="30" y1="84" x2="202" y2="84" stroke="#262626" strokeWidth="1" />
      <KeyCardRow y={110} glyph="ext" label={t('guides.art.howObeliskWorks.extension')} />
      <text x="204" y="110" {...mono}>NIP-07</text>{/* i18n-exempt: protocol name */}
      <KeyCardRow y={140} glyph="phone" label={t('guides.art.howObeliskWorks.signerApp')} />
      <text x="204" y="140" {...mono}>NIP-46</text>{/* i18n-exempt: protocol name */}
      <KeyCardRow y={170} glyph="lock" label={t('guides.art.howObeliskWorks.session')} />
      <text x="54" y="188" fontSize="11" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.sessionSub')}
      </text>
    </g>
  );
}
