export default function WhatIsObeliskHero() {
  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-what-title hero-what-desc"
      className="w-full h-auto"
    >
      <title id="hero-what-title">What is Obelisk</title>
      <desc id="hero-what-desc">
        An obelisk monument surrounded by orbiting Nostr keys and floating chat bubbles.
      </desc>

      <defs>
        <linearGradient id="sky-what" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <linearGradient id="obelisk-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b4f953" />
          <stop offset="100%" stopColor="#8bc34a" />
        </linearGradient>
        <radialGradient id="glow-what" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-what)" />

      {/* grid floor */}
      <g opacity="0.25" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 12 }).map((_, i) => (
          <line
            key={`h${i}`}
            x1="0"
            y1={280 + i * 12}
            x2="800"
            y2={280 + i * 12}
          />
        ))}
        {Array.from({ length: 16 }).map((_, i) => {
          const x = 400 + (i - 8) * 60;
          return <line key={`v${i}`} x1={x} y1="280" x2={400 + (i - 8) * 20} y2="400" />;
        })}
      </g>

      {/* pulsing glow behind obelisk */}
      <g style={{ transformOrigin: '400px 220px', transformBox: 'fill-box' } as React.CSSProperties}>
        <circle cx="400" cy="220" r="140" fill="url(#glow-what)" className="animate-glow-pulse" />
      </g>

      {/* Real Obelisk silhouette — Buenos Aires Obelisco, two-face shading.
          Source paths match src/components/ObeliskIcon.tsx; transform scales
          the 512-viewBox logo so its tip sits at (400, 50) and its base
          at (400, 300). */}
      <g transform="translate(257.2 41.1) scale(0.558)">
        <path
          d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z"
          fill="#8bc34a"
          opacity="0.85"
        />
        <path
          d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z"
          fill="url(#obelisk-body)"
        />
      </g>
      {/* plinth */}
      <rect x="370" y="300" width="60" height="10" fill="#8bc34a" />
      <rect x="358" y="310" width="84" height="8" fill="#2d3a1a" />

      {/* orbiting group — wrap for CSS animation */}
      <g style={{ transformOrigin: '400px 220px', transformBox: 'fill-box' } as React.CSSProperties}>
        <g className="animate-orbit" style={{ ['--orbit-radius' as string]: '160px', ['--orbit-duration' as string]: '22s' } as React.CSSProperties}>
          <circle cx="400" cy="220" r="10" fill="#b4f953" />
          <text x="400" y="224" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0a0a0a">K</text>
        </g>
        <g
          className="animate-orbit-reverse"
          style={{ ['--orbit-radius' as string]: '110px', ['--orbit-duration' as string]: '18s' } as React.CSSProperties}
        >
          <rect x="392" y="212" width="16" height="16" rx="3" fill="#8bc34a" />
          <text x="400" y="224" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a0a0a">n</text>
        </g>
        <g
          className="animate-orbit"
          style={{ ['--orbit-radius' as string]: '200px', ['--orbit-duration' as string]: '28s' } as React.CSSProperties}
        >
          <circle cx="400" cy="220" r="7" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1.5" />
        </g>
      </g>

      {/* floating chat bubbles */}
      <g opacity="0.7">
        {[
          { x: 120, y: 320, d: '0s', dur: '14s' },
          { x: 200, y: 340, d: '3s', dur: '16s' },
          { x: 620, y: 310, d: '1s', dur: '18s' },
          { x: 700, y: 330, d: '5s', dur: '20s' },
          { x: 560, y: 350, d: '7s', dur: '15s' },
        ].map((b, i) => (
          <g
            key={i}
            className="animate-float-up"
            style={{
              ['--float-delay' as string]: b.d,
              ['--float-duration' as string]: b.dur,
              ['--bubble-opacity' as string]: '0.35',
            } as React.CSSProperties}
          >
            <rect x={b.x} y={b.y} width="36" height="22" rx="11" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1" />
            <circle cx={b.x + 11} cy={b.y + 11} r="2" fill="#b4f953" />
            <circle cx={b.x + 18} cy={b.y + 11} r="2" fill="#b4f953" />
            <circle cx={b.x + 25} cy={b.y + 11} r="2" fill="#b4f953" />
          </g>
        ))}
      </g>

      {/* particles */}
      {Array.from({ length: 14 }).map((_, i) => {
        const x = 120 + (i * 43) % 580;
        const y = 80 + ((i * 57) % 180);
        const delay = `${(i * 0.4).toFixed(2)}s`;
        const dur = `${(4 + (i % 5)).toFixed(1)}s`;
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="1.5"
            fill="#b4f953"
            className="animate-particle"
            style={{
              ['--particle-delay' as string]: delay,
              ['--particle-duration' as string]: dur,
            } as React.CSSProperties}
          />
        );
      })}
    </svg>
  );
}
