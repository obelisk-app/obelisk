export default function RelayGroupsDiagram() {
  return (
    <svg
      viewBox="0 0 800 360"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="NIP-29 relay-based group"
      className="w-full h-auto"
    >
      <rect width="800" height="360" fill="#0a0a0a" />

      <text x="400" y="34" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fafafa">
        NIP-29 — the relay hosts the group
      </text>

      {/* relay in the center */}
      <g>
        <rect
          x="280"
          y="120"
          width="240"
          height="160"
          rx="14"
          fill="#171717"
          stroke="#b4f953"
          strokeWidth="2"
        />
        <rect x="298" y="138" width="204" height="24" rx="6" fill="#2d3a1a" />
        <text x="400" y="155" textAnchor="middle" fontSize="12" fontWeight="700" fill="#b4f953" fontFamily="monospace">
          relay.group.host
        </text>

        {/* group metadata rows */}
        {[
          { y: 180, k: 'members', v: '42' },
          { y: 200, k: 'roles', v: 'admin / mod / member' },
          { y: 220, k: 'events', v: 'kind 9 chat, kind 11 thread' },
          { y: 240, k: 'admin check', v: 'relay enforces' },
        ].map((r) => (
          <g key={r.k}>
            <text x="302" y={r.y} fontSize="11" fontWeight="600" fill="#a3a3a3" fontFamily="monospace">
              {r.k}
            </text>
            <text x="498" y={r.y} textAnchor="end" fontSize="11" fill="#fafafa" fontFamily="monospace">
              {r.v}
            </text>
          </g>
        ))}
        <text x="400" y="270" textAnchor="middle" fontSize="10" fill="#b4f953">
          no central Obelisk server needed
        </text>
      </g>

      {/* clients connecting */}
      {[
        { x: 80, y: 90, label: 'alice' },
        { x: 80, y: 220, label: 'bob' },
        { x: 720, y: 90, label: 'carol' },
        { x: 720, y: 220, label: 'dan' },
      ].map((c) => {
        const fromX = c.x < 400 ? c.x + 32 : c.x - 32;
        const toX = c.x < 400 ? 280 : 520;
        const toY = 200;
        return (
          <g key={c.label}>
            <rect
              x={c.x - 30}
              y={c.y - 20}
              width="60"
              height="40"
              rx="8"
              fill="#171717"
              stroke="#b4f953"
              strokeWidth="1.5"
            />
            <circle cx={c.x} cy={c.y - 4} r="5" fill="#b4f953" />
            <rect x={c.x - 10} y={c.y + 4} width="20" height="8" rx="3" fill="#2d3a1a" />
            <text x={c.x} y={c.y + 35} textAnchor="middle" fontSize="10" fontWeight="600" fill="#a3a3a3">
              {c.label}
            </text>

            <line
              x1={fromX}
              y1={c.y}
              x2={toX}
              y2={toY}
              stroke="#b4f953"
              strokeWidth="1.5"
              strokeDasharray="4 8"
              className="animate-dash-flow"
            />
          </g>
        );
      })}

      {/* footer */}
      <text x="400" y="330" textAnchor="middle" fontSize="11" fill="#a3a3a3" fontFamily="monospace">
        move off Postgres → keep Discord UX, gain Nostr portability
      </text>
    </svg>
  );
}
