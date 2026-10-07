import { useTranslations } from 'next-intl';
import { ZAP_LANE_X as LANE_X, zapArrows, type ZapLane as Lane } from '@/utils/guides/diagram-art';

/**
 * A NIP-57 zap as Obelisk sends it. The sender's client signs the zap
 * request, the recipient's LNURL server answers with an invoice, the sender's
 * wallet pays it (WebLN in the browser, or NWC over a Nostr relay), and the
 * LNURL server publishes the kind 9735 receipt that every client shows. No
 * Obelisk server is anywhere in the money path.
 */
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
  const arrows = zapArrows(rows);

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
      {arrows.map((a) => (
        <g key={a.key}>
          <line
            x1={a.x1} y1={a.y} x2={a.x2} y2={a.y}
            stroke="#b4f953"
            strokeWidth="1.8"
            strokeDasharray="6 6"
            className="animate-dash-flow"
            style={{ animationDelay: a.delay } as React.CSSProperties}
          />
          <polygon points={a.head} fill="#b4f953" />
          <text x={a.labelX} y={a.y - 8} textAnchor="middle" fontSize="11" fontWeight="600" fill="#fafafa" fontFamily="monospace">
            {a.label}
          </text>
        </g>
      ))}

      {/* footnote */}
      <text x="450" y="340" textAnchor="middle" fontSize="11" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.zapFlow.note')}
      </text>
    </svg>
  );
}
