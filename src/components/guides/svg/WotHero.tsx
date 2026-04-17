export default function WotHero() {
  const nodes = [
    { id: 'you', x: 400, y: 200, r: 28, label: 'you', trust: 100, primary: true },
    { id: 'a', x: 260, y: 120, r: 18, label: '', trust: 82 },
    { id: 'b', x: 540, y: 120, r: 18, label: '', trust: 74 },
    { id: 'c', x: 200, y: 250, r: 16, label: '', trust: 60 },
    { id: 'd', x: 600, y: 250, r: 16, label: '', trust: 55 },
    { id: 'e', x: 140, y: 180, r: 12, label: '', trust: 30 },
    { id: 'f', x: 660, y: 180, r: 12, label: '', trust: 25 },
    { id: 'g', x: 340, y: 310, r: 14, label: '', trust: 45 },
    { id: 'h', x: 460, y: 310, r: 14, label: '', trust: 42 },
    { id: 's1', x: 70, y: 90, r: 10, label: '!', trust: 5 },
    { id: 's2', x: 730, y: 90, r: 10, label: '!', trust: 8 },
    { id: 's3', x: 50, y: 320, r: 10, label: '!', trust: 3 },
  ];
  const edges: [string, string][] = [
    ['you', 'a'], ['you', 'b'], ['you', 'c'], ['you', 'd'],
    ['a', 'e'], ['a', 'c'], ['b', 'f'], ['b', 'd'],
    ['c', 'g'], ['d', 'h'], ['g', 'h'], ['a', 'b'],
    ['e', 's1'], ['f', 's2'], ['c', 's3'],
  ];
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const nodeColor = (trust: number, primary?: boolean) => {
    if (primary) return '#b4f953';
    if (trust >= 60) return '#8bc34a';
    if (trust >= 30) return '#2d3a1a';
    return '#3a1a1a';
  };
  const nodeStroke = (trust: number) => {
    if (trust < 20) return '#b45353';
    return '#b4f953';
  };

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-wot-title hero-wot-desc"
      className="w-full h-auto"
    >
      <title id="hero-wot-title">Web of Trust graph</title>
      <desc id="hero-wot-desc">
        A trust graph with your node at the center, connected nodes in lime green for
        high trust, and red-outlined spam nodes at the periphery.
      </desc>

      <defs>
        <radialGradient id="bg-wot" cx="0.5" cy="0.5" r="0.7">
          <stop offset="0%" stopColor="#1e2812" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
        <radialGradient id="you-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#bg-wot)" />

      {/* edges */}
      <g stroke="#b4f953" strokeOpacity="0.4" strokeWidth="1.2" fill="none">
        {edges.map(([a, b], i) => {
          const A = byId[a];
          const B = byId[b];
          const isSpam = B.trust < 20 || A.trust < 20;
          return (
            <line
              key={i}
              x1={A.x}
              y1={A.y}
              x2={B.x}
              y2={B.y}
              stroke={isSpam ? '#b45353' : '#b4f953'}
              strokeOpacity={isSpam ? 0.25 : 0.45}
              strokeDasharray={isSpam ? '3 5' : '0'}
            />
          );
        })}
      </g>

      {/* animated pulses on primary edges */}
      <g stroke="#b4f953" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.9">
        <line
          x1={byId.you.x}
          y1={byId.you.y}
          x2={byId.a.x}
          y2={byId.a.y}
          strokeDasharray="4 10"
          className="animate-dash-flow"
        />
        <line
          x1={byId.you.x}
          y1={byId.you.y}
          x2={byId.b.x}
          y2={byId.b.y}
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '0.5s' } as React.CSSProperties}
        />
        <line
          x1={byId.you.x}
          y1={byId.you.y}
          x2={byId.c.x}
          y2={byId.c.y}
          strokeDasharray="4 10"
          className="animate-dash-flow"
          style={{ animationDelay: '1s' } as React.CSSProperties}
        />
      </g>

      {/* you glow */}
      <circle cx="400" cy="200" r="80" fill="url(#you-glow)" className="animate-glow-pulse"
        style={{ transformOrigin: '400px 200px', transformBox: 'fill-box' } as React.CSSProperties} />

      {/* nodes */}
      <g>
        {nodes.map((n, i) => (
          <g key={n.id}>
            <circle
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={nodeColor(n.trust, n.primary)}
              stroke={nodeStroke(n.trust)}
              strokeWidth={n.primary ? 2.5 : 1.5}
            />
            {n.primary && (
              <text
                x={n.x}
                y={n.y + 5}
                textAnchor="middle"
                fontSize="13"
                fontWeight="700"
                fill="#0a0a0a"
              >
                YOU
              </text>
            )}
            {!n.primary && n.trust < 20 && (
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                fontSize="12"
                fontWeight="700"
                fill="#b45353"
              >
                !
              </text>
            )}
            {!n.primary && n.trust >= 20 && (
              <circle
                cx={n.x}
                cy={n.y}
                r={Math.max(2, n.r - 10)}
                fill="#b4f953"
                opacity={n.trust / 200 + 0.3}
                className="animate-dot-pulse"
                style={{
                  transformOrigin: `${n.x}px ${n.y}px`,
                  animationDelay: `${(i * 0.3).toFixed(2)}s`,
                } as React.CSSProperties}
              />
            )}
          </g>
        ))}
      </g>

      {/* legend */}
      <g fontSize="11" fontWeight="600">
        <circle cx="40" cy="20" r="6" fill="#b4f953" />
        <text x="52" y="24" fill="#fafafa">direct follow</text>
        <circle cx="160" cy="20" r="6" fill="#8bc34a" />
        <text x="172" y="24" fill="#fafafa">friend-of-friend</text>
        <circle cx="310" cy="20" r="6" fill="#3a1a1a" stroke="#b45353" strokeWidth="1.5" />
        <text x="322" y="24" fill="#fafafa">filtered (spam)</text>
      </g>
    </svg>
  );
}
