import { useTranslations } from 'next-intl';
import { particleField } from '@/utils/guides/art-geometry';

/** The signed events drifting between the relay and the projects. */
const EVENTS = particleField(6, {
  x: { base: 80, step: 130, mod: 640 },
  y: { base: 200, step: 23, mod: 30 },
  delayStep: 0.5,
  durBase: 5,
  durCycle: 3,
});

export default function SwapAnythingHero() {
  const t = useTranslations();
  const projects = [
    {
      x: 90,
      title: 'obelisk-dex',
      sub: t('guides.art.swapAnything.dexRole'),
      meta: t('guides.art.swapAnything.dexMeta'),
    },
    {
      x: 310,
      title: 'obelisk-sfu',
      sub: t('guides.art.swapAnything.sfuRole'),
      meta: t('guides.art.swapAnything.sfuMeta'),
    },
    {
      x: 530,
      title: 'obelisk-bots',
      sub: t('guides.art.swapAnything.botsRole'),
      meta: t('guides.art.swapAnything.botsMeta'),
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
      <title id="hero-swap-title">{t('guides.art.swapAnything.title')}</title>
      <desc id="hero-swap-desc">{t('guides.art.swapAnything.desc')}</desc>

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
          {t('guides.art.swapAnything.relayRole')}
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
        {projects.map((p, i) => (
          <line
            key={`line-${i}`}
            x1={p.x + 90}
            y1={170}
            x2={p.x + 90}
            y2={250}
            strokeDasharray="4 8"
            className="animate-dash-flow"
            style={{ animationDelay: `${(i * 0.3).toFixed(2)}s` } as React.CSSProperties}
          />
        ))}
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
      {EVENTS.map((p) => (
        <g
          key={`pkt-${p.i}`}
          className="animate-particle"
          style={{
            ['--particle-delay' as string]: p.delay,
            ['--particle-duration' as string]: p.dur,
            transformOrigin: `${p.x}px ${p.y}px`,
          } as React.CSSProperties}
        >
          <rect x={p.x} y={p.y} width="14" height="9" rx="2" fill="#2d3a1a" stroke="#b4f953" strokeWidth="1" />
          <rect x={p.x + 2} y={p.y + 2.5} width="6" height="1.4" fill="#b4f953" opacity="0.7" />
          <rect x={p.x + 2} y={p.y + 5} width="4" height="1.4" fill="#b4f953" opacity="0.5" />
        </g>
      ))}

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
        {t('guides.art.swapAnything.footer')}
      </text>
    </svg>
  );
}
