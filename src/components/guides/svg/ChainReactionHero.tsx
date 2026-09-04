/**
 * Chain Reaction: one orb too many, and the cell hands its neighbours the
 * problem. The hero draws the moment of the split — a critical cell mid-burst
 * with four orbs leaving it, over a board that has already changed colour.
 */
const SEATS = ['#ff4d5e', '#b4f953', '#38bdf8'];

/** A board that looks played rather than generated: fixed, not random. */
const CELLS: Array<{ col: number; row: number; count: number; seat: number }> = [
  { col: 0, row: 0, count: 1, seat: 0 }, { col: 2, row: 0, count: 2, seat: 1 },
  { col: 5, row: 0, count: 1, seat: 2 }, { col: 1, row: 1, count: 3, seat: 1 },
  { col: 4, row: 1, count: 1, seat: 0 }, { col: 6, row: 1, count: 2, seat: 2 },
  { col: 0, row: 2, count: 2, seat: 2 }, { col: 3, row: 2, count: 1, seat: 1 },
  { col: 6, row: 2, count: 1, seat: 0 }, { col: 2, row: 3, count: 1, seat: 2 },
  { col: 5, row: 3, count: 3, seat: 0 }, { col: 7, row: 3, count: 1, seat: 1 },
];

const X0 = 60;
const Y0 = 96;
const SIZE = 54;

function orbOffsets(count: number): Array<[number, number]> {
  if (count <= 1) return [[0, 0]];
  if (count === 2) return [[-8, 0], [8, 0]];
  return [[-8, 6], [8, 6], [0, -8]];
}

export default function ChainReactionHero() {
  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-chain-reaction-title hero-chain-reaction-desc"
      className="w-full h-auto"
    >
      <title id="hero-chain-reaction-title">A cell going critical on a Chain Reaction board</title>
      <desc id="hero-chain-reaction-desc">
        A dark grid of cells holding red, lime and cyan orbs. One cell is bursting and
        sending an orb into each of its four neighbours, the cascade that gives Chain
        Reaction its name, played over a Nostr relay in Obelisk.
      </desc>

      <defs>
        <radialGradient id="bg-chain-reaction" cx="0.5" cy="0.45" r="0.75">
          <stop offset="0%" stopColor="#1a1216" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
        <radialGradient id="cr-burst-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#b4f953" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#b4f953" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#bg-chain-reaction)" />

      {/* the grid */}
      <g stroke="#b4f953" strokeOpacity="0.18" fill="none">
        {Array.from({ length: 8 }, (_, c) =>
          Array.from({ length: 4 }, (_, r) => (
            <rect
              key={`${c}-${r}`}
              x={X0 + c * SIZE}
              y={Y0 + r * SIZE}
              width={SIZE}
              height={SIZE}
            />
          )),
        )}
      </g>

      {/* settled orbs */}
      {CELLS.map(({ col, row, count, seat }) => {
        const cx = X0 + col * SIZE + SIZE / 2;
        const cy = Y0 + row * SIZE + SIZE / 2;
        return (
          <g key={`orb-${col}-${row}`}>
            {orbOffsets(count).map(([dx, dy], i) => (
              <circle
                key={i}
                cx={cx + dx}
                cy={cy + dy}
                r="7"
                fill={SEATS[seat]}
                fillOpacity="0.9"
              />
            ))}
          </g>
        );
      })}

      {/* the cell that just went critical, and the four orbs leaving it */}
      <g>
        <circle cx={X0 + 3 * SIZE + SIZE / 2} cy={Y0 + 1 * SIZE + SIZE / 2} r="52" fill="url(#cr-burst-glow)" />
        <circle
          cx={X0 + 3 * SIZE + SIZE / 2}
          cy={Y0 + 1 * SIZE + SIZE / 2}
          r="20"
          fill="none"
          stroke="#b4f953"
          strokeWidth="2.5"
          strokeOpacity="0.9"
        />
        {[[0, -SIZE], [0, SIZE], [-SIZE, 0], [SIZE, 0]].map(([dx, dy], i) => (
          <circle
            key={i}
            cx={X0 + 3 * SIZE + SIZE / 2 + dx * 0.55}
            cy={Y0 + 1 * SIZE + SIZE / 2 + dy * 0.55}
            r="8"
            fill="#b4f953"
          />
        ))}
      </g>

      {/* the right-hand column: what the move actually is on the wire */}
      <g fontWeight="600">
        <text x="540" y="118" fill="#fafafa" fontSize="15">One orb over the limit</text>
        <text x="540" y="140" fill="#a3a3a3" fontSize="11">every neighbour takes one,</text>
        <text x="540" y="156" fill="#a3a3a3" fontSize="11">and may burst in turn</text>

        <g fontFamily="ui-monospace, monospace">
          <rect x="540" y="186" width="216" height="58" rx="10" fill="#171717" stroke="#262626" />
          <text x="558" y="210" fill="#b4f953" fontSize="12">kind 2390</text>
          <text x="558" y="230" fill="#a3a3a3" fontSize="11">{'{"op":"move","cell":11}'}</text>
        </g>
        <text x="540" y="266" fill="#a3a3a3" fontSize="11">the cascade is replayed,</text>
        <text x="540" y="282" fill="#a3a3a3" fontSize="11">never published</text>

        {/* seat legend */}
        {SEATS.map((hex, i) => (
          <g key={hex}>
            <circle cx={548} cy={316 + i * 22} r="6" fill={hex} />
            <text x={564} y={320 + i * 22} fill="#a3a3a3" fontSize="11">seat {i + 1}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
