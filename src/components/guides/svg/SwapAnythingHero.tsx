export default function SwapAnythingHero() {
  const projects = [
    {
      x: 90,
      title: 'obelisk-dex',
      sub: 'Web chat client',
      meta: 'browser · NIP-07',
    },
    {
      x: 310,
      title: 'obelisk-sfu',
      sub: 'Voice mixing server',
      meta: 'WebRTC · large calls',
    },
    {
      x: 530,
      title: 'obelisk-bots',
      sub: 'Bot runtime',
      meta: 'mod · games · ops',
    },
  ];

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-swap-title hero-swap-desc"
      className="w-full h-auto"
    >
      <title id="hero-swap-title">Swap anything, trust nothing</title>
      <desc id="hero-swap-desc">
        The Obelisk ecosystem — one self-hostable relay at the top connected to a chat
        client, a voice SFU, and a bot runtime, every piece independently replaceable.
      </desc>

      <defs>
        <linearGradient id="sky-swap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <linearGradient id="relay-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2d3a1a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <radialGradient id="relay-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
        <marker
          id="swap-arrow"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <circle cx="5" cy="5" r="3" fill="#b4f953" />
        </marker>
      </defs>

      <rect width="800" height="400" fill="url(#sky-swap)" />

      {/* faint grid */}
      <g opacity="0.12" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
      </g>

      {/* relay glow */}
      <ellipse
        cx="400"
        cy="100"
        rx="320"
        ry="80"
        fill="url(#relay-glow)"
        className="animate-glow-pulse"
        style={{ transformOrigin: '400px 100px', transformBox: 'fill-box' } as React.CSSProperties}
      />

      {/* relay pill at top */}
      <g>
        <rect
          x="80"
          y="50"
          width="640"
          height="120"
          rx="60"
          fill="url(#relay-fill)"
          stroke="#b4f953"
          strokeWidth="2"
        />
        <text
          x="400"
          y="98"
          textAnchor="middle"
          fontSize="28"
          fontWeight="800"
          fill="#b4f953"
          fontFamily="monospace"
          letterSpacing="-0.5"
        >
          obelisk-relay
        </text>
        <text
          x="400"
          y="124"
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          fill="#fafafa"
          opacity="0.85"
        >
          Self-hostable Nostr relay · whitelist · admin UI
        </text>

        {/* dot ports along bottom of pill */}
        {[210, 270, 330, 380, 420, 470, 530, 590].map((cx, i) => (
          <circle
            key={i}
            cx={cx}
            cy="158"
            r="2.5"
            fill="#b4f953"
            opacity="0.7"
            className="animate-dot-pulse"
            style={{
              transformOrigin: `${cx}px 158px`,
              animationDelay: `${(i * 0.18).toFixed(2)}s`,
            } as React.CSSProperties}
          />
        ))}
      </g>

      {/* connection lines from relay to each project */}
      <g stroke="#b4f953" strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.85">
        {projects.map((p, i) => {
          const startX = p.x + 90;
          const endX = p.x + 90;
          return (
            <line
              key={`line-${i}`}
              x1={startX}
              y1={170}
              x2={endX}
              y2={250}
              strokeDasharray="4 8"
              className="animate-dash-flow"
              style={{ animationDelay: `${(i * 0.3).toFixed(2)}s` } as React.CSSProperties}
            />
          );
        })}
      </g>

      {/* project cards */}
      {projects.map((p, i) => (
        <g key={p.title}>
          <rect
            x={p.x}
            y={250}
            width="180"
            height="110"
            rx="14"
            fill="#171717"
            stroke="#b4f953"
            strokeWidth="1.6"
          />
          {/* indicator pill */}
          <rect
            x={p.x + 14}
            y={266}
            width="32"
            height="6"
            rx="3"
            fill="#b4f953"
            opacity="0.85"
            className="animate-dot-pulse"
            style={{
              transformOrigin: `${p.x + 30}px 269px`,
              animationDelay: `${(i * 0.4).toFixed(2)}s`,
            } as React.CSSProperties}
          />
          <text
            x={p.x + 90}
            y={296}
            textAnchor="middle"
            fontSize="17"
            fontWeight="800"
            fill="#fafafa"
            fontFamily="monospace"
          >
            {p.title}
          </text>
          <text
            x={p.x + 90}
            y={320}
            textAnchor="middle"
            fontSize="12"
            fontWeight="600"
            fill="#a3a3a3"
          >
            {p.sub}
          </text>
          <text
            x={p.x + 90}
            y={342}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill="#b4f953"
            opacity="0.75"
            fontFamily="monospace"
          >
            {p.meta}
          </text>
        </g>
      ))}

      {/* floating signed events */}
      {Array.from({ length: 6 }).map((_, i) => {
        const x = 80 + (i * 130) % 640;
        const y = 200 + ((i * 23) % 30);
        const delay = `${(i * 0.5).toFixed(2)}s`;
        const dur = `${(5 + (i % 3)).toFixed(1)}s`;
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
            <rect x={x} y={y} width="14" height="9" rx="2" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1" />
            <rect x={x + 2} y={y + 2.5} width="6" height="1.4" fill="#b4f953" opacity="0.7" />
            <rect x={x + 2} y={y + 5} width="4" height="1.4" fill="#b4f953" opacity="0.5" />
          </g>
        );
      })}

      {/* footer caption */}
      <text
        x="400"
        y="384"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="#a3a3a3"
        fontFamily="monospace"
      >
        four projects · one protocol · no central server
      </text>
    </svg>
  );
}
