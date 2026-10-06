import { useTranslations } from 'next-intl';

/**
 * A NIP-57 zap as Obelisk sends it. The sender's client signs the zap
 * request, the recipient's LNURL server answers with an invoice, the sender's
 * wallet pays it (WebLN in the browser, or NWC over a Nostr relay), and the
 * LNURL server publishes the kind 9735 receipt that every client shows. No
 * Obelisk server is anywhere in the money path.
 */
const LANE_X = { C: 110, W: 335, L: 565, R: 790 } as const;
type Lane = keyof typeof LANE_X;

export default function ZapFlowDiagram() {
  const t = useTranslations();
  const rows: { y: number; from: Lane; to: Lane; label: string }[] = [
    { y: 84, from: 'C', to: 'L', label: t('guides.art.zapFlow.request') },
    { y: 126, from: 'L', to: 'C', label: t('guides.art.zapFlow.invoice') },
    { y: 168, from: 'C', to: 'W', label: t('guides.art.zapFlow.pay') },
    { y: 210, from: 'W', to: 'L', label: t('guides.art.zapFlow.paid') },
    { y: 252, from: 'L', to: 'R', label: t('guides.art.zapFlow.receipt') },
    { y: 294, from: 'R', to: 'C', label: t('guides.art.zapFlow.shown') },
  ];
  const laneLabel: Record<Lane, string> = {
    C: t('guides.art.zapFlow.client'),
    W: t('guides.art.zapFlow.wallet'),
    L: t('guides.art.zapFlow.lnurl'),
    R: t('guides.art.zapFlow.relays'),
  };
  const lanes = Object.keys(LANE_X) as Lane[];

  return (
    <svg
      viewBox="0 0 900 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={t('guides.art.zapFlow.label')}
      className="w-full h-auto"
    >
      <rect width="900" height="360" fill="#0a0a0a" />

      {/* lane headers */}
      {lanes.map((lane) => (
        <g key={lane}>
          <rect x={LANE_X[lane] - 95} y="12" width="190" height="32" rx="16" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1.5" />
          <text x={LANE_X[lane]} y="33" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953">
            {laneLabel[lane]}
          </text>
        </g>
      ))}

      {/* lane lines */}
      <g stroke="#262626" strokeWidth="1" strokeDasharray="3 3">
        {lanes.map((lane) => (
          <line key={lane} x1={LANE_X[lane]} y1="48" x2={LANE_X[lane]} y2="312" />
        ))}
      </g>

      {/* arrows */}
      {rows.map((r, i) => {
        const x1 = LANE_X[r.from];
        const x2 = LANE_X[r.to];
        const right = x2 > x1;
        return (
          <g key={i}>
            <line
              x1={x1} y1={r.y} x2={x2} y2={r.y}
              stroke="#b4f953"
              strokeWidth="1.8"
              strokeDasharray="6 6"
              className="animate-dash-flow"
              style={{ animationDelay: `${i * 0.25}s` } as React.CSSProperties}
            />
            <polygon
              points={
                right
                  ? `${x2 - 8},${r.y - 5} ${x2},${r.y} ${x2 - 8},${r.y + 5}`
                  : `${x2 + 8},${r.y - 5} ${x2},${r.y} ${x2 + 8},${r.y + 5}`
              }
              fill="#b4f953"
            />
            <text x={(x1 + x2) / 2} y={r.y - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fafafa" fontFamily="monospace">
              {r.label}
            </text>
          </g>
        );
      })}

      {/* footnote */}
      <text x="450" y="340" textAnchor="middle" fontSize="11" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.zapFlow.note')}
      </text>
    </svg>
  );
}
