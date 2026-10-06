/**
 * Hero for "Run your own relay".
 *
 * The article's one idea is that admission is a ladder rather than a switch,
 * so the drawing is the ladder: a relay at the left, three arcs widening away
 * from it for the three tiers, each arc carrying fewer-trusted keys and a
 * smaller share of the rate budget, and a block list cutting across all three
 * because it is decided first and overrides everything behind it.
 *
 * Lime, like every other hero here. The relay's own console is purple - the
 * screenshots inside the article carry that, and this does not pretend to be
 * one of them.
 */

import { useTranslations } from 'next-intl';

export default function RelayHero() {
  const t = useTranslations();
  const tiers = [
    { r: 135, n: 1, sub: t('guides.art.relay.byHand'), perMinute: 6000, opacity: 1 },
    { r: 195, n: 2, sub: t('guides.art.relay.twoHops'), perMinute: 3000, opacity: 0.72 },
    { r: 255, n: 3, sub: t('guides.art.relay.threeHops'), perMinute: 1500, opacity: 0.46 },
  ];

  /** Keys sitting on each arc - fewer drawn than exist, further out, dimmer. */
  const keys = [
    { r: 135, angles: [-38, -13, 13, 38] },
    { r: 195, angles: [-42, -25, -8, 9, 26, 43] },
    { r: 255, angles: [-44, -31, -18, -5, 8, 21, 34, 44] },
  ];

  const cx = 80;
  const cy = 200;
  /** Half-sweep of every arc. Wide enough to read as a ring, short enough
   *  that the outermost one still clears the top and bottom of the frame. */
  const SPAN = 48;
  const pt = (r: number, deg: number) => {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-relay-title hero-relay-desc"
      className="w-full h-auto"
    >
      <title id="hero-relay-title">{t('guides.art.relay.title')}</title>
      <desc id="hero-relay-desc">{t('guides.art.relay.desc')}</desc>

      <defs>
        <linearGradient id="sky-relay" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0a0a0a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <linearGradient id="relay-core-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2d3a1a" />
          <stop offset="100%" stopColor="#1e2812" />
        </linearGradient>
        <radialGradient id="relay-core-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#sky-relay)" />

      {/* faint grid */}
      <g opacity="0.12" stroke="#b4f953" strokeWidth="0.5">
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={40 + i * 40} x2="800" y2={40 + i * 40} />
        ))}
        {Array.from({ length: 19 }).map((_, i) => (
          <line key={`v${i}`} x1={40 + i * 40} y1="0" x2={40 + i * 40} y2="400" />
        ))}
      </g>

      {/* the tier arcs, widening away from the relay */}
      <g fill="none" strokeLinecap="round">
        {tiers.map((tier, i) => {
          const a = pt(tier.r, -SPAN);
          const b = pt(tier.r, SPAN);
          return (
          <path
            key={tier.n}
            d={`M ${a.x.toFixed(1)} ${a.y.toFixed(1)} A ${tier.r} ${tier.r} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`}
            stroke="#b4f953"
            strokeWidth={2.4 - i * 0.5}
            opacity={tier.opacity * 0.85}
            strokeDasharray={i === 0 ? undefined : i === 1 ? '10 7' : '4 9'}
            className={i === 0 ? undefined : 'animate-dash-flow'}
            style={{ animationDelay: `${(i * 0.4).toFixed(2)}s` } as React.CSSProperties}
          />
          );
        })}
      </g>

      {/* admitted keys on each arc */}
      {keys.map((ring, ri) =>
        ring.angles.map((a, ki) => {
          const p = pt(ring.r, a);
          return (
            <circle
              key={`k${ri}-${ki}`}
              cx={p.x}
              cy={p.y}
              r={5.5 - ri * 1.1}
              fill="#b4f953"
              opacity={tiers[ri].opacity * 0.9}
              className="animate-dot-pulse"
              style={{
                transformOrigin: `${p.x}px ${p.y}px`,
                animationDelay: `${(ri * 0.5 + ki * 0.17).toFixed(2)}s`,
              } as React.CSSProperties}
            />
          );
        }),
      )}

      {/* the relay itself */}
      <ellipse
        cx={cx}
        cy={cy}
        rx="110"
        ry="90"
        fill="url(#relay-core-glow)"
        className="animate-glow-pulse"
        style={{ transformOrigin: `${cx}px ${cy}px`, transformBox: 'fill-box' } as React.CSSProperties}
      />
      <rect
        x={cx - 54}
        y={cy - 40}
        width="108"
        height="80"
        rx="16"
        fill="url(#relay-core-fill)"
        stroke="#b4f953"
        strokeWidth="2"
      />
      <text
        x={cx}
        y={cy - 8}
        textAnchor="middle"
        fontSize="15"
        fontWeight="800"
        fill="#b4f953"
        fontFamily="monospace"
      >
        relay
      </text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fontWeight="600" fill="#fafafa" opacity="0.8">
        {t('guides.art.relay.yours')}
      </text>
      {/* ports */}
      <g>
        {[-30, -10, 10, 30].map((dx, i) => (
          <circle
            key={i}
            cx={cx + dx}
            cy={cy + 28}
            r="2.5"
            fill="#b4f953"
            opacity="0.7"
            className="animate-dot-pulse"
            style={{
              transformOrigin: `${cx + dx}px ${cy + 28}px`,
              animationDelay: `${(i * 0.2).toFixed(2)}s`,
            } as React.CSSProperties}
          />
        ))}
      </g>

      {/* tier legend */}
      <g>
        {tiers.map((tier, i) => {
          const y = 96 + i * 62;
          return (
            <g key={`legend-${tier.n}`} opacity={tier.opacity}>
              <rect x="470" y={y - 24} width="290" height="48" rx="12" fill="#171717" stroke="#b4f953" strokeWidth="1.4" />
              <text x="490" y={y - 4} fontSize="14" fontWeight="800" fill="#b4f953" fontFamily="monospace">
                {t('guides.art.relay.tier', { n: tier.n })}
              </text>
              <text x="490" y={y + 13} fontSize="11" fontWeight="600" fill="#fafafa" opacity="0.75">
                {tier.sub}
              </text>
              <text x="742" y={y + 4} textAnchor="end" fontSize="13" fontWeight="700" fill="#fafafa">
                {t('guides.art.relay.perMinute', { count: tier.perMinute })}
              </text>
            </g>
          );
        })}

        {/* the block list, decided first and overriding all of it */}
        <g>
          <rect x="470" y={282} width="290" height="48" rx="12" fill="#1a0f0f" stroke="#f87171" strokeWidth="1.4" />
          <text x="490" y={302} fontSize="14" fontWeight="800" fill="#f87171" fontFamily="monospace">
            {t('guides.art.relay.blocked')}
          </text>
          <text x="490" y={319} fontSize="11" fontWeight="600" fill="#fafafa" opacity="0.7">
            {t('guides.art.relay.blockedRule')}
          </text>
          <text x="742" y={310} textAnchor="end" fontSize="13" fontWeight="700" fill="#f87171">
            {t('guides.art.relay.nothing')}
          </text>
        </g>
      </g>

      {/* a refused key, turned back short of the outermost arc */}
      <g opacity="0.9">
        <line x1="352" y1="336" x2="424" y2="312" stroke="#f87171" strokeWidth="1.6" strokeDasharray="5 6" />
        <circle cx="352" cy="336" r="5" fill="none" stroke="#f87171" strokeWidth="2" />
        <line x1="348.5" y1="332.5" x2="355.5" y2="339.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
        <line x1="355.5" y1="332.5" x2="348.5" y2="339.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
      </g>

      <text x="470" y={356} fontSize="11.5" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.relay.distance')}
      </text>
      <text x="470" y={373} fontSize="11.5" fontWeight="600" fill="#a3a3a3">
        {t('guides.art.relay.evidence')}
      </text>
    </svg>
  );
}
