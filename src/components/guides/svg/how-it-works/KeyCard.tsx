import { useTranslations } from 'next-intl';

const DIM = '#5c7a2e';

/**
 * Where the key lives: never on a server. A browser extension (NIP-07), a
 * signer app over NIP-46, or the encrypted session on this device (an nsec
 * sealed by the session vault). The "Sign" step happens here, for the app.
 */
export default function KeyCard() {
  const t = useTranslations();
  const mono = { fontSize: 9.5, fill: '#b4f953', fontFamily: 'monospace', textAnchor: 'end' as const };

  return (
    <g>
      <rect x="16" y="18" width="236" height="104" rx="12" fill="#0f0f0f" stroke={DIM} strokeWidth="1.6" />
      <KeyGlyph x={36} y={36} />
      <text x="54" y="40" fontSize="12" fontWeight="700" fill="#fafafa">
        {t('guides.art.howObeliskWorks.key')}
      </text>

      <Row y={62} glyph="ext" label={t('guides.art.howObeliskWorks.extension')} />
      <text x="240" y="62" {...mono}>NIP-07</text>{/* i18n-exempt: protocol name */}
      <Row y={82} glyph="phone" label={t('guides.art.howObeliskWorks.signerApp')} />
      <text x="240" y="82" {...mono}>NIP-46</text>{/* i18n-exempt: protocol name */}
      <Row y={102} glyph="lock" label={t('guides.art.howObeliskWorks.session')} />
      <text x="240" y="102" textAnchor="end" fontSize="9.5" fill="#a3a3a3">
        {t('guides.art.howObeliskWorks.sessionSub')}
      </text>

      {/* the key signs for the app below */}
      <line x1="134" y1="122" x2="134" y2="160" stroke="#b4f953" strokeWidth="1.6" strokeDasharray="4 5" className="animate-dash-flow" />
      <rect x="98" y="129" width="72" height="22" rx="11" fill="#b4f953" />
      <text x="134" y="144" textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#0a0a0a">
        {t('guides.art.howObeliskWorks.sign')}
      </text>
    </g>
  );
}

function Row({ y, glyph, label }: { y: number; glyph: 'ext' | 'phone' | 'lock'; label: string }) {
  return (
    <g>
      <RowGlyph kind={glyph} x={36} y={y - 4} />
      <text x="50" y={y} fontSize="10.5" fontWeight="600" fill="#fafafa">
        {label}
      </text>
    </g>
  );
}

function KeyGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="#b4f953" strokeWidth="1.6" fill="none" strokeLinecap="round">
      <circle cx={x - 4} cy={y} r="4.5" />
      <line x1={x + 1} y1={y} x2={x + 10} y2={y} />
      <line x1={x + 7} y1={y} x2={x + 7} y2={y + 4} />
    </g>
  );
}

function RowGlyph({ kind, x, y }: { kind: 'ext' | 'phone' | 'lock'; x: number; y: number }) {
  const stroke = { stroke: '#b4f953', strokeWidth: 1.2, fill: 'none', strokeLinecap: 'round' as const };
  if (kind === 'ext') {
    return (
      <g {...stroke}>
        <rect x={x - 6} y={y - 4.5} width="12" height="9" rx="1.5" />
        <line x1={x - 6} y1={y - 1.5} x2={x + 6} y2={y - 1.5} />
      </g>
    );
  }
  if (kind === 'phone') {
    return (
      <g {...stroke}>
        <rect x={x - 4} y={y - 6} width="8" height="12" rx="1.5" />
        <line x1={x - 1} y1={y + 3.5} x2={x + 1} y2={y + 3.5} />
      </g>
    );
  }
  return (
    <g {...stroke}>
      <rect x={x - 5} y={y - 1} width="10" height="7" rx="1.5" />
      <path d={`M${x - 3} ${y - 1} v-2 a3 3 0 0 1 6 0 v2`} />
    </g>
  );
}
