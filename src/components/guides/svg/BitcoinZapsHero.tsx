export default function BitcoinZapsHero() {
  const sparks = [
    { x: 230, y: 110, d: '0s', dur: '6s' },
    { x: 560, y: 90, d: '1.2s', dur: '7s' },
    { x: 150, y: 260, d: '0.4s', dur: '5.5s' },
    { x: 640, y: 280, d: '2s', dur: '6.5s' },
    { x: 320, y: 320, d: '1.5s', dur: '5s' },
    { x: 500, y: 330, d: '0.8s', dur: '6.2s' },
    { x: 90, y: 180, d: '2.6s', dur: '7.5s' },
    { x: 710, y: 170, d: '0.2s', dur: '6.8s' },
  ];

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-zaps-title hero-zaps-desc"
      className="w-full h-auto"
    >
      <title id="hero-zaps-title">Bitcoin zaps in chat</title>
      <desc id="hero-zaps-desc">
        A chat message with a glowing lightning bolt flowing into it, orbited by sat particles
        representing a Lightning zap sent over Nostr Wallet Connect.
      </desc>

      <defs>
        <linearGradient id="sky-zaps" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#20180a" />
        </linearGradient>
        <radialGradient id="bolt-glow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#f7b32b" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f7b32b" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="bubble-glow" cx="0.5" cy="0.5" r="0.6">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="bolt-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="60%" stopColor="#f7b32b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-zaps)" />

      {/* faint grid */}
      <g opacity="0.1" stroke="#f7b32b" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
      </g>

      {/* flowing payment path: wallet → bolt → bubble */}
      <g stroke="#f7b32b" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9">
        <line
          x1="120" y1="200" x2="330" y2="200"
          strokeDasharray="4 12"
          className="animate-dash-flow"
        />
        <line
          x1="470" y1="200" x2="680" y2="200"
          strokeDasharray="4 12"
          className="animate-dash-flow"
          style={{ animationDelay: '0.6s' } as React.CSSProperties}
        />
      </g>

      {/* wallet card (left) */}
      <g>
        <rect x="40" y="160" width="90" height="80" rx="10" fill="#171717" stroke="#f7b32b" strokeWidth="1.6" />
        <rect x="48" y="174" width="74" height="16" rx="3" fill="#2b1f08" />
        <rect x="48" y="198" width="50" height="8" rx="2" fill="#f7b32b" opacity="0.7" />
        <rect x="48" y="212" width="34" height="8" rx="2" fill="#f7b32b" opacity="0.4" />
        <text x="85" y="258" textAnchor="middle" fontSize="11" fontWeight="600" fill="#a3a3a3" fontFamily="monospace">
          NWC wallet
        </text>
      </g>

      {/* central bolt with glow + pulse */}
      <g style={{ transformOrigin: '400px 200px', transformBox: 'fill-box' } as React.CSSProperties}>
        <circle cx="400" cy="200" r="90" fill="url(#bolt-glow)" className="animate-glow-pulse" />
        <polygon
          points="405,120 355,215 395,215 380,290 445,185 405,185 420,120"
          fill="url(#bolt-fill)"
          stroke="#fde68a"
          strokeWidth="1.5"
        />
      </g>

      {/* chat bubble (right) with zap badge */}
      <g>
        <circle cx="700" cy="200" r="70" fill="url(#bubble-glow)"
          className="animate-glow-pulse"
          style={{ transformOrigin: '700px 200px', transformBox: 'fill-box', animationDelay: '0.8s' } as React.CSSProperties}
        />
        <path
          d="M625 160 h140 a14 14 0 0 1 14 14 v50 a14 14 0 0 1 -14 14 h-90 l-22 20 v-20 h-28 a14 14 0 0 1 -14 -14 v-50 a14 14 0 0 1 14 -14 z"
          fill="#171717"
          stroke="#b4f953"
          strokeWidth="1.6"
        />
        <rect x="640" y="178" width="100" height="7" rx="2" fill="#b4f953" opacity="0.7" />
        <rect x="640" y="192" width="70" height="7" rx="2" fill="#b4f953" opacity="0.45" />
        <rect x="640" y="206" width="50" height="7" rx="2" fill="#b4f953" opacity="0.3" />

        {/* zap badge */}
        <g>
          <circle cx="770" cy="160" r="18" fill="#0a0a0a" stroke="#f7b32b" strokeWidth="1.8" />
          <polygon points="772,148 762,164 770,164 767,174 778,158 770,158 774,148" fill="#f7b32b" />
        </g>
      </g>

      {/* floating sats */}
      {sparks.map((s, i) => (
        <g
          key={`sat-${i}`}
          className="animate-particle"
          style={{
            ['--particle-delay' as string]: s.d,
            ['--particle-duration' as string]: s.dur,
            transformOrigin: `${s.x}px ${s.y}px`,
          } as React.CSSProperties}
        >
          <circle cx={s.x} cy={s.y} r="3.5" fill="#f7b32b" opacity="0.85" />
          <text
            x={s.x + 7}
            y={s.y + 4}
            fontSize="10"
            fontWeight="700"
            fill="#f7b32b"
            fontFamily="monospace"
            opacity="0.75"
          >
            +{21 * (i + 1)}
          </text>
        </g>
      ))}

      {/* travelling sparks on path */}
      <g>
        <circle r="4" fill="#fde68a">
          <animateMotion dur="2.4s" repeatCount="indefinite" path="M120,200 L330,200" />
        </circle>
        <circle r="4" fill="#fde68a">
          <animateMotion dur="2.4s" begin="0.8s" repeatCount="indefinite" path="M120,200 L330,200" />
        </circle>
        <circle r="4" fill="#fde68a">
          <animateMotion dur="2.4s" repeatCount="indefinite" path="M470,200 L680,200" />
        </circle>
        <circle r="4" fill="#fde68a">
          <animateMotion dur="2.4s" begin="1.2s" repeatCount="indefinite" path="M470,200 L680,200" />
        </circle>
      </g>

      {/* legend */}
      <g fontSize="11" fontWeight="600">
        <circle cx="40" cy="24" r="6" fill="#f7b32b" />
        <text x="52" y="28" fill="#fafafa">Lightning (NIP-47)</text>
        <circle cx="220" cy="24" r="6" fill="#b4f953" />
        <text x="232" y="28" fill="#fafafa">chat message</text>
      </g>
    </svg>
  );
}
