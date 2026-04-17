export default function AuthFlowDiagram() {
  const rows = [
    { y: 70, from: 'C', to: 'S', label: '1. POST /api/auth/challenge', dir: 'right' as const },
    { y: 115, from: 'S', to: 'C', label: '2. challenge string + timestamp', dir: 'left' as const },
    { y: 160, from: 'C', to: 'K', label: '3. sign(challenge) with Nostr key', dir: 'right' as const },
    { y: 205, from: 'K', to: 'C', label: '4. signature', dir: 'left' as const },
    { y: 250, from: 'C', to: 'S', label: '5. POST /api/auth/verify { pubkey, sig }', dir: 'right' as const },
    { y: 295, from: 'S', to: 'C', label: '6. session cookie', dir: 'left' as const },
  ];
  const LANE_X = { C: 120, S: 400, K: 680 };

  return (
    <svg
      viewBox="0 0 800 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Authentication sequence diagram"
      className="w-full h-auto"
    >
      <rect width="800" height="360" fill="#0a0a0a" />

      {/* lane headers */}
      {(['C', 'S', 'K'] as const).map((lane) => (
        <g key={lane}>
          <rect
            x={LANE_X[lane] - 60}
            y="12"
            width="120"
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
            {lane === 'C' ? 'Client' : lane === 'S' ? 'Server' : 'Nostr signer'}
          </text>
        </g>
      ))}

      {/* lane lines */}
      <g stroke="#262626" strokeWidth="1" strokeDasharray="3 3">
        <line x1={LANE_X.C} y1="48" x2={LANE_X.C} y2="340" />
        <line x1={LANE_X.S} y1="48" x2={LANE_X.S} y2="340" />
        <line x1={LANE_X.K} y1="48" x2={LANE_X.K} y2="340" />
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
