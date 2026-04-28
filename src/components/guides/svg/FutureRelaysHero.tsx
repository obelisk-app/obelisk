export default function FutureRelaysHero() {
  const relays = [
    { cx: 160, cy: 120, r: 36, label: 'relay.a' },
    { cx: 640, cy: 120, r: 36, label: 'relay.b' },
    { cx: 400, cy: 90, r: 40, label: 'relay.c' },
    { cx: 240, cy: 300, r: 32, label: 'relay.d' },
    { cx: 560, cy: 300, r: 32, label: 'relay.e' },
    { cx: 400, cy: 320, r: 34, label: 'relay.f' },
  ];
  const edges: [number, number][] = [
    [0, 2], [1, 2], [0, 3], [1, 4], [3, 5], [4, 5], [2, 5], [0, 1], [3, 4],
  ];

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-future-title hero-future-desc"
      className="w-full h-auto"
    >
      <title id="hero-future-title">Future: Nostr relay-based groups</title>
      <desc id="hero-future-desc">
        A mesh of Nostr relays exchanging encrypted group messages, with no central server.
      </desc>

      <defs>
        <linearGradient id="sky-future" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <radialGradient id="node-glow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-future)" />

      {/* faint grid */}
      <g opacity="0.15" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
      </g>

      {/* mesh edges with flowing dashes */}
      <g stroke="#b4f953" strokeWidth="1.5" strokeOpacity="0.6" fill="none" strokeLinecap="round">
        {edges.map(([a, b], i) => {
          const A = relays[a];
          const B = relays[b];
          return (
            <line
              key={i}
              x1={A.cx}
              y1={A.cy}
              x2={B.cx}
              y2={B.cy}
              strokeDasharray="4 10"
              className="animate-dash-flow"
              style={{ animationDelay: `${(i * 0.25).toFixed(2)}s` } as React.CSSProperties}
            />
          );
        })}
      </g>

      {/* relay nodes */}
      <g>
        {relays.map((r, i) => (
          <g key={i}>
            <circle cx={r.cx} cy={r.cy} r={r.r + 16} fill="url(#node-glow)" />
            <circle
              cx={r.cx}
              cy={r.cy}
              r={r.r}
              fill="#171717"
              stroke="#b4f953"
              strokeWidth="1.8"
            />
            <circle
              cx={r.cx}
              cy={r.cy}
              r={r.r - 12}
              fill="#2d3a1a"
              stroke="#b4f953"
              strokeWidth="1"
              opacity="0.7"
              className="animate-dot-pulse"
              style={{
                transformOrigin: `${r.cx}px ${r.cy}px`,
                animationDelay: `${(i * 0.5).toFixed(2)}s`,
              } as React.CSSProperties}
            />
            {/* tower lines */}
            <line
              x1={r.cx}
              y1={r.cy - r.r + 4}
              x2={r.cx}
              y2={r.cy - r.r - 14}
              stroke="#b4f953"
              strokeWidth="1.5"
            />
            <circle cx={r.cx} cy={r.cy - r.r - 16} r="3" fill="#b4f953" />
            <text
              x={r.cx}
              y={r.cy + r.r + 18}
              textAnchor="middle"
              fontSize="11"
              fontWeight="600"
              fill="#a3a3a3"
              fontFamily="monospace"
            >
              {r.label}
            </text>
          </g>
        ))}
      </g>

      {/* NIP-29 tag in the middle */}
      <g>
        <rect x="336" y="184" width="128" height="32" rx="16" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.5" />
        <text x="400" y="204" textAnchor="middle" fontSize="13" fontWeight="700" fill="#b4f953" fontFamily="monospace">
          NIP-29 group
        </text>
      </g>

      {/* floating encrypted packets */}
      {Array.from({ length: 8 }).map((_, i) => {
        const x = 100 + (i * 90) % 600;
        const y = 160 + ((i * 37) % 120);
        const delay = `${(i * 0.6).toFixed(2)}s`;
        const dur = `${(5 + (i % 4)).toFixed(1)}s`;
        return (
          <g
            key={`pkt-${i}`}
            className="animate-particle"
            style={{
              ['--particle-delay' as string]: delay,
              ['--particle-duration' as string]: dur,
              transformOrigin: `${x}px ${y}px`,
            } as React.CSSProperties}
          >
            <rect x={x} y={y} width="14" height="10" rx="2" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1" />
            <rect x={x + 2} y={y + 3} width="6" height="1.5" fill="#b4f953" opacity="0.7" />
            <rect x={x + 2} y={y + 6} width="4" height="1.5" fill="#b4f953" opacity="0.5" />
          </g>
        );
      })}
    </svg>
  );
}
