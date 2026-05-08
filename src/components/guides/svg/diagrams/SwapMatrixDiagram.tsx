interface Row {
  layer: string;
  ours: string;
  alts: string[];
}

const ROWS: Row[] = [
  { layer: 'Client', ours: 'obelisk-dex', alts: ['other clients', 'your own fork'] },
  { layer: 'Voice', ours: 'obelisk-sfu', alts: ['any SFU', 'peer-to-peer'] },
  { layer: 'Bots', ours: 'obelisk-bots', alts: ['your own bot', 'any keypair'] },
  { layer: 'Relay', ours: 'obelisk-relay', alts: ['strfry', 'nostr-rs-relay'] },
];

const ROW_HEIGHT = 64;
const TOP = 60;
const COL_W = 200;
const COL_GAP = 16;
const LABEL_X = 24;
const COL_X = [LABEL_X + 110, LABEL_X + 110 + (COL_W + COL_GAP), LABEL_X + 110 + 2 * (COL_W + COL_GAP)];

export default function SwapMatrixDiagram() {
  const height = TOP + ROWS.length * ROW_HEIGHT + 36;

  return (
    <svg
      viewBox={`0 0 ${COL_X[2] + COL_W + 24} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Swap matrix — every layer of the Obelisk stack is replaceable"
      className="w-full h-auto"
    >
      <rect width="100%" height="100%" fill="#0a0a0a" />

      <text
        x={LABEL_X}
        y="32"
        fontSize="14"
        fontWeight="700"
        fill="#fafafa"
      >
        Every layer is replaceable
      </text>
      <text
        x={COL_X[0] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#b4f953"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        OURS
      </text>
      <text
        x={COL_X[1] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#a3a3a3"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        ALTERNATIVE
      </text>
      <text
        x={COL_X[2] + COL_W / 2}
        y="32"
        textAnchor="middle"
        fontSize="11"
        fontWeight="700"
        fill="#a3a3a3"
        fontFamily="monospace"
        letterSpacing="0.5"
      >
        ALTERNATIVE
      </text>

      {ROWS.map((row, i) => {
        const y = TOP + i * ROW_HEIGHT;
        const cells = [
          { x: COL_X[0], label: row.ours, primary: true },
          { x: COL_X[1], label: row.alts[0], primary: false },
          { x: COL_X[2], label: row.alts[1], primary: false },
        ];

        return (
          <g key={row.layer}>
            {/* row label */}
            <text
              x={LABEL_X}
              y={y + 30}
              fontSize="13"
              fontWeight="700"
              fill="#a3a3a3"
            >
              {row.layer}
            </text>

            {/* connecting strand across the row */}
            <line
              x1={COL_X[0] + COL_W}
              y1={y + 24}
              x2={COL_X[2]}
              y2={y + 24}
              stroke="#b4f953"
              strokeWidth="1"
              strokeDasharray="3 6"
              strokeOpacity="0.4"
              className="animate-dash-flow"
              style={{ animationDelay: `${(i * 0.3).toFixed(2)}s` } as React.CSSProperties}
            />

            {cells.map((cell, j) => (
              <g key={cell.label}>
                <rect
                  x={cell.x}
                  y={y}
                  width={COL_W}
                  height="48"
                  rx="10"
                  fill={cell.primary ? '#1e2812' : '#171717'}
                  stroke={cell.primary ? '#b4f953' : '#262626'}
                  strokeWidth={cell.primary ? '1.8' : '1'}
                />
                <text
                  x={cell.x + COL_W / 2}
                  y={y + 30}
                  textAnchor="middle"
                  fontSize="14"
                  fontWeight={cell.primary ? '800' : '600'}
                  fill={cell.primary ? '#b4f953' : '#fafafa'}
                  fontFamily="monospace"
                >
                  {cell.label}
                </text>
                {cell.primary && (
                  <circle
                    cx={cell.x + 14}
                    cy={y + 24}
                    r="3"
                    fill="#b4f953"
                    className="animate-dot-pulse"
                    style={{
                      transformOrigin: `${cell.x + 14}px ${y + 24}px`,
                      animationDelay: `${(i * 0.4 + j * 0.1).toFixed(2)}s`,
                    } as React.CSSProperties}
                  />
                )}
              </g>
            ))}
          </g>
        );
      })}

      <text
        x={LABEL_X}
        y={TOP + ROWS.length * ROW_HEIGHT + 22}
        fontSize="11"
        fontWeight="600"
        fill="#a3a3a3"
        fontFamily="monospace"
      >
        same wire format · same signatures · the pieces don&apos;t care
      </text>
    </svg>
  );
}
