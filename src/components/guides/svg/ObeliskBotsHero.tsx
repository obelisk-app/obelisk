export default function ObeliskBotsHero() {
  const packets = [
    { x: 140, y: 98, label: '9735', delay: '0s', dur: '5.4s' },
    { x: 640, y: 86, label: 'kind 7', delay: '0.8s', dur: '5.9s' },
    { x: 95, y: 285, label: 'NIP-29', delay: '1.6s', dur: '6.2s' },
    { x: 675, y: 286, label: 'kind 9', delay: '2.3s', dur: '5.7s' },
  ];

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-bots-title hero-bots-desc"
      className="w-full h-auto"
    >
      <title id="hero-bots-title">Obelisk Bots and the zap bot</title>
      <desc id="hero-bots-desc">
        A stylish zap bot with black sunglasses listening for Nostr zap receipts and
        posting signed announcements into NIP-29 Obelisk groups.
      </desc>

      <defs>
        <linearGradient id="sky-bots" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#18230d" />
        </linearGradient>
        <linearGradient id="bot-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#263315" />
          <stop offset="100%" stopColor="#11180b" />
        </linearGradient>
        <linearGradient id="bolt-bots" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="62%" stopColor="#f7b32b" />
          <stop offset="100%" stopColor="#b45309" />
        </linearGradient>
        <radialGradient id="bot-glow" cx="0.5" cy="0.5" r="0.58">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="zap-glow-bots" cx="0.5" cy="0.5" r="0.56">
          <stop offset="0%" stopColor="#f7b32b" stopOpacity="0.38" />
          <stop offset="100%" stopColor="#f7b32b" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-bots)" />

      <g opacity="0.1" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
      </g>
      <g opacity="0.08" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <line key={`v${i}`} x1={80 + i * 80} y1="0" x2={80 + i * 80} y2="400" />
        ))}
      </g>

      <ellipse
        cx="400"
        cy="206"
        rx="176"
        ry="130"
        fill="url(#bot-glow)"
        className="animate-glow-pulse"
        style={{ transformOrigin: '400px 206px', transformBox: 'fill-box' } as React.CSSProperties}
      />
      <ellipse
        cx="400"
        cy="206"
        rx="118"
        ry="92"
        fill="url(#zap-glow-bots)"
        className="animate-glow-pulse"
        style={{
          transformOrigin: '400px 206px',
          transformBox: 'fill-box',
          animationDelay: '0.7s',
        } as React.CSSProperties}
      />

      <g stroke="#b4f953" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.86">
        <path d="M178 135 C250 130 285 154 320 180" strokeDasharray="4 10" className="animate-dash-flow" />
        <path
          d="M622 135 C548 128 516 154 480 180"
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '0.5s' } as React.CSSProperties}
        />
        <path
          d="M178 265 C256 270 288 248 320 226"
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '1s' } as React.CSSProperties}
        />
        <path
          d="M622 265 C544 270 512 248 480 226"
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '1.5s' } as React.CSSProperties}
        />
      </g>

      <g>
        <rect x="44" y="78" width="156" height="86" rx="16" fill="#171717" stroke="#b4f953" strokeWidth="1.6" />
        <text x="122" y="110" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fafafa" fontFamily="monospace">
          zap receipt
        </text>
        <text x="122" y="134" textAnchor="middle" fontSize="12" fontWeight="700" fill="#f7b32b" fontFamily="monospace">
          kind 9735
        </text>
        <rect x="72" y="144" width="100" height="6" rx="3" fill="#b4f953" opacity="0.5" />
      </g>

      <g>
        <rect x="600" y="78" width="156" height="86" rx="16" fill="#171717" stroke="#f7b32b" strokeWidth="1.6" />
        <text x="678" y="110" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fafafa" fontFamily="monospace">
          reaction
        </text>
        <text x="678" y="134" textAnchor="middle" fontSize="12" fontWeight="700" fill="#f7b32b" fontFamily="monospace">
          kind 7 zap
        </text>
        <rect x="628" y="144" width="100" height="6" rx="3" fill="#f7b32b" opacity="0.5" />
      </g>

      <g>
        <rect x="44" y="238" width="156" height="86" rx="16" fill="#171717" stroke="#b4f953" strokeWidth="1.6" />
        <text x="122" y="270" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fafafa" fontFamily="monospace">
          groups
        </text>
        <text x="122" y="294" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953" fontFamily="monospace">
          NIP-29 scan
        </text>
        <rect x="72" y="304" width="100" height="6" rx="3" fill="#b4f953" opacity="0.5" />
      </g>

      <g>
        <rect x="600" y="238" width="156" height="86" rx="16" fill="#171717" stroke="#b4f953" strokeWidth="1.6" />
        <text x="678" y="270" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fafafa" fontFamily="monospace">
          announcement
        </text>
        <text x="678" y="294" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953" fontFamily="monospace">
          kind 9 post
        </text>
        <rect x="628" y="304" width="100" height="6" rx="3" fill="#b4f953" opacity="0.5" />
      </g>

      <g>
        <line x1="400" y1="110" x2="400" y2="78" stroke="#b4f953" strokeWidth="3" strokeLinecap="round" />
        <circle
          cx="400"
          cy="70"
          r="8"
          fill="#b4f953"
          className="animate-dot-pulse"
          style={{ transformOrigin: '400px 70px' } as React.CSSProperties}
        />
        <rect x="298" y="118" width="204" height="154" rx="32" fill="url(#bot-face)" stroke="#b4f953" strokeWidth="3" />
        <rect x="330" y="152" width="140" height="46" rx="18" fill="#050505" stroke="#0a0a0a" strokeWidth="4" />
        <path d="M330 175 L470 160" stroke="#171717" strokeWidth="8" strokeLinecap="round" opacity="0.75" />
        <rect x="360" y="158" width="30" height="14" rx="7" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.4" opacity="0.88" />
        <rect x="410" y="158" width="30" height="14" rx="7" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.4" opacity="0.88" />
        <rect x="388" y="174" width="24" height="4" rx="2" fill="#0a0a0a" />
        <rect x="362" y="218" width="76" height="12" rx="6" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.5" />
        <rect
          x="338"
          y="282"
          width="124"
          height="28"
          rx="14"
          fill="#0a0a0a"
          stroke="#b4f953"
          strokeWidth="1.5"
        />
        <text x="400" y="301" textAnchor="middle" fontSize="13" fontWeight="900" fill="#b4f953" fontFamily="monospace">
          ZAP BOT
        </text>
      </g>

      <g>
        <circle cx="502" cy="124" r="30" fill="#0a0a0a" stroke="#f7b32b" strokeWidth="2" />
        <polygon points="506,104 488,132 502,132 497,150 520,116 506,116" fill="url(#bolt-bots)" />
      </g>

      <g>
        <path
          d="M282 214 h-28 a12 12 0 0 0 -12 12 v46 a12 12 0 0 0 12 12 h64"
          fill="none"
          stroke="#b4f953"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeDasharray="4 8"
          className="animate-dash-flow"
        />
        <path
          d="M518 214 h30 a12 12 0 0 1 12 12 v46 a12 12 0 0 1 -12 12 h-64"
          fill="none"
          stroke="#b4f953"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeDasharray="4 8"
          className="animate-dash-flow"
          style={{ animationDelay: '0.8s' } as React.CSSProperties}
        />
      </g>

      {packets.map((packet, i) => (
        <g
          key={packet.label}
          className="animate-particle"
          style={{
            ['--particle-delay' as string]: packet.delay,
            ['--particle-duration' as string]: packet.dur,
            transformOrigin: `${packet.x}px ${packet.y}px`,
          } as React.CSSProperties}
        >
          <rect
            x={packet.x}
            y={packet.y}
            width={i % 2 === 0 ? 48 : 56}
            height="20"
            rx="10"
            fill="#0a0a0a"
            stroke={i === 1 ? '#f7b32b' : '#b4f953'}
            strokeWidth="1.2"
          />
          <text
            x={packet.x + (i % 2 === 0 ? 24 : 28)}
            y={packet.y + 14}
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill={i === 1 ? '#f7b32b' : '#b4f953'}
            fontFamily="monospace"
          >
            {packet.label}
          </text>
        </g>
      ))}

      <g fontSize="11" fontWeight="700" fontFamily="monospace">
        <rect x="244" y="342" width="96" height="24" rx="12" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.4" />
        <text x="292" y="358" textAnchor="middle" fill="#b4f953">own nsec</text>
        <rect x="352" y="342" width="96" height="24" rx="12" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.4" />
        <text x="400" y="358" textAnchor="middle" fill="#b4f953">NIP-42</text>
        <rect x="460" y="342" width="96" height="24" rx="12" fill="#0a0a0a" stroke="#b4f953" strokeWidth="1.4" />
        <text x="508" y="358" textAnchor="middle" fill="#b4f953">PM2</text>
      </g>
    </svg>
  );
}
