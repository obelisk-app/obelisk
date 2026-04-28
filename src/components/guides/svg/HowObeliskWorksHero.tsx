export default function HowObeliskWorksHero() {
  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-how-title hero-how-desc"
      className="w-full h-auto"
    >
      <title id="hero-how-title">How Obelisk works</title>
      <desc id="hero-how-desc">
        A browser client, Obelisk server, and Nostr relays connected with flowing data lines.
      </desc>

      <defs>
        <linearGradient id="sky-how" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <linearGradient id="how-obelisk-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b4f953" />
          <stop offset="100%" stopColor="#8bc34a" />
        </linearGradient>

        {/* Reusable arrowheads */}
        <marker
          id="arrow-green"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#b4f953" />
        </marker>
        <marker
          id="arrow-olive"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8bc34a" />
        </marker>
      </defs>

      <rect width="800" height="400" fill="url(#sky-how)" />

      {/* subtle grid */}
      <g opacity="0.15" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <line key={`g${i}`} x1="0" y1={50 + i * 50} x2="800" y2={50 + i * 50} />
        ))}
      </g>

      {/* Client node */}
      <g>
        <rect x="60" y="150" width="140" height="100" rx="12" fill="#171717" stroke="#b4f953" strokeWidth="1.5" />
        <rect x="72" y="162" width="116" height="8" rx="2" fill="#2d3a1a" />
        <circle cx="82" cy="166" r="2" fill="#b4f953" />
        <rect x="72" y="180" width="100" height="4" rx="1" fill="#262626" />
        <rect x="72" y="190" width="80" height="4" rx="1" fill="#262626" />
        <rect x="72" y="200" width="92" height="4" rx="1" fill="#262626" />
        <rect x="72" y="220" width="60" height="18" rx="9" fill="#b4f953" />
        <text x="102" y="232" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0a0a0a">Sign</text>
        <text x="130" y="275" textAnchor="middle" fontSize="12" fontWeight="600" fill="#a3a3a3">Client</text>
      </g>

      {/* Server node — real Buenos Aires Obelisco silhouette (from ObeliskIcon).
          Logo viewBox is 512; scaled to fit tip at (400, 110), base at (400, 290). */}
      <g>
        <g transform="translate(299.98 103.59) scale(0.391)">
          <path
            d="M 256,16 L 220,72 L 196,460 L 200,464 L 256,464 L 256,72 Z"
            fill="#8bc34a"
            opacity="0.85"
          />
          <path
            d="M 256,16 L 292,72 L 316,460 L 312,464 L 256,464 L 256,72 Z"
            fill="url(#how-obelisk-body)"
          />
        </g>
        {/* plinth */}
        <rect x="372" y="290" width="56" height="8" fill="#8bc34a" />
        <rect x="362" y="298" width="76" height="6" fill="#2d3a1a" />
        <text x="400" y="330" textAnchor="middle" fontSize="12" fontWeight="600" fill="#a3a3a3">Obelisk server</text>
        <text x="400" y="345" textAnchor="middle" fontSize="10" fill="#a3a3a3">Channels · Messages · Realtime</text>
      </g>

      {/* Relays cluster */}
      <g>
        {[
          { cx: 640, cy: 120, r: 22 },
          { cx: 720, cy: 170, r: 20 },
          { cx: 680, cy: 230, r: 24 },
          { cx: 600, cy: 210, r: 18 },
          { cx: 740, cy: 250, r: 16 },
        ].map((n, i) => (
          <g key={i}>
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r}
              fill="#171717"
              stroke="#b4f953"
              strokeWidth="1.5"
            />
            <circle
              cx={n.cx}
              cy={n.cy}
              r={n.r - 8}
              fill="#b4f953"
              opacity="0.5"
              className="animate-dot-pulse"
              style={{ transformOrigin: `${n.cx}px ${n.cy}px`, animationDelay: `${i * 0.4}s` } as React.CSSProperties}
            />
          </g>
        ))}
        <text x="670" y="310" textAnchor="middle" fontSize="12" fontWeight="600" fill="#a3a3a3">Nostr relays</text>
        <text x="670" y="325" textAnchor="middle" fontSize="10" fill="#a3a3a3">Identity · Profiles</text>
      </g>

      {/* Flow: Client ↔ Server (bidirectional: session + messages) */}
      <g stroke="#b4f953" strokeWidth="2" fill="none" strokeLinecap="round">
        <line
          x1="210"
          y1="200"
          x2="372"
          y2="200"
          strokeDasharray="6 6"
          className="animate-dash-flow"
          markerStart="url(#arrow-green)"
          markerEnd="url(#arrow-green)"
        />
      </g>

      {/* Flow: Client ↔ Relays (sign kind 0 / auth challenge — bidirectional) */}
      <g stroke="#8bc34a" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.75">
        <path
          d="M 180 168 Q 400 60 598 118"
          strokeDasharray="5 7"
          className="animate-dash-flow"
          style={{ animationDuration: '3s' } as React.CSSProperties}
          markerStart="url(#arrow-olive)"
          markerEnd="url(#arrow-olive)"
        />
      </g>

      {/* Flow: Server → Relays (profile fetch) */}
      <g stroke="#b4f953" strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7">
        <line
          x1="428"
          y1="220"
          x2="578"
          y2="212"
          strokeDasharray="4 8"
          className="animate-dash-flow"
          markerEnd="url(#arrow-green)"
        />
      </g>

      {/* labels on flows */}
      <text x="291" y="192" fontSize="10" fill="#b4f953" fontWeight="600" textAnchor="middle">session + messages</text>
      <text x="389" y="80" fontSize="10" fill="#8bc34a" fontWeight="600" textAnchor="middle">sign kind 0 / auth challenge</text>
      <text x="503" y="228" fontSize="9" fill="#b4f953" fontWeight="600" textAnchor="middle" opacity="0.8">profile fetch</text>
    </svg>
  );
}
