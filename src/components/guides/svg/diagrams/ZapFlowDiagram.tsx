export default function ZapFlowDiagram() {
  const rows = [
    { y: 75,  from: 'C',  to: 'S',  label: '1. POST /api/wallet/zap { amountSats }',    dir: 'right' as const },
    { y: 120, from: 'S',  to: 'RW', label: '2. NWC makeInvoice (o LNURL-pay)',          dir: 'right' as const },
    { y: 165, from: 'RW', to: 'S',  label: '3. BOLT11 invoice',                         dir: 'left'  as const },
    { y: 210, from: 'S',  to: 'SW', label: '4. NWC payInvoice',                         dir: 'right' as const },
    { y: 255, from: 'SW', to: 'S',  label: '5. payment preimage (pagado por Lightning)', dir: 'left'  as const },
    { y: 300, from: 'S',  to: 'C',  label: '6. Socket.io new-message ⚡',               dir: 'left'  as const },
  ];
  const LANE_X = { C: 90, S: 340, RW: 590, SW: 810 };
  const LANE_LABEL: Record<keyof typeof LANE_X, string> = {
    C: 'Client',
    S: 'Obelisk server',
    RW: 'Receiver wallet',
    SW: 'Sender wallet',
  };

  return (
    <svg
      viewBox="0 0 900 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Zap sequence diagram"
      className="w-full h-auto"
    >
      <rect width="900" height="360" fill="#0a0a0a" />

      {/* lane headers */}
      {(Object.keys(LANE_X) as Array<keyof typeof LANE_X>).map((lane) => (
        <g key={lane}>
          <rect
            x={LANE_X[lane] - 70}
            y="12"
            width="140"
            height="32"
            rx="16"
            fill="#2d3a1a"
            stroke="#b4f953"
            strokeWidth="1.5"
          />
          <text
            x={LANE_X[lane]}
            y="33"
            textAnchor="middle"
            fontSize="12"
            fontWeight="700"
            fill="#b4f953"
          >
            {LANE_LABEL[lane]}
          </text>
        </g>
      ))}

      {/* lane lines */}
      <g stroke="#262626" strokeWidth="1" strokeDasharray="3 3">
        {(Object.keys(LANE_X) as Array<keyof typeof LANE_X>).map((lane) => (
          <line
            key={lane}
            x1={LANE_X[lane]}
            y1="48"
            x2={LANE_X[lane]}
            y2="340"
          />
        ))}
      </g>

      {/* arrows */}
      {rows.map((r, i) => {
        const x1 = LANE_X[r.from as keyof typeof LANE_X];
        const x2 = LANE_X[r.to as keyof typeof LANE_X];
        const midX = (x1 + x2) / 2;
        return (
          <g key={i}>
            <line
              x1={x1}
              y1={r.y}
              x2={x2}
              y2={r.y}
              stroke="#b4f953"
              strokeWidth="1.8"
              strokeDasharray="6 6"
              className="animate-dash-flow"
              style={{ animationDelay: `${i * 0.25}s` } as React.CSSProperties}
            />
            <polygon
              points={
                r.dir === 'right'
                  ? `${x2 - 8},${r.y - 5} ${x2},${r.y} ${x2 - 8},${r.y + 5}`
                  : `${x2 + 8},${r.y - 5} ${x2},${r.y} ${x2 + 8},${r.y + 5}`
              }
              fill="#b4f953"
            />
            <text
              x={midX}
              y={r.y - 8}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#fafafa"
              fontFamily="monospace"
            >
              {r.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
