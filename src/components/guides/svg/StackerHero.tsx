/**
 * Stacker: two wells, and the only thing that travels between them. Clearing
 * lines does not score points here — it sends rows, so the hero draws the
 * attack crossing the gap rather than a scoreboard.
 */
const PIECES = ['#22d3ee', '#3b82f6', '#f97316', '#facc15', '#b4f953', '#a855f7', '#ef4444'];

const CELL = 22;
const COLS = 10;
const ROWS = 9;
const TOP = 116;
const GARBAGE = '#4b5563';

type Block = [col: number, row: number, color: string];

function row(r: number, cols: number[], offset = 0): Block[] {
  return cols.map((c, i) => [c, r, PIECES[(i + offset) % PIECES.length]] as Block);
}

/** The left well, one full row from a clear. */
const LEFT: Block[] = [
  ...row(8, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 2),
  ...row(7, [0, 1, 2, 4, 5, 7, 9], 5),
  ...row(6, [0, 4, 5, 9], 1),
  ...row(5, [5], 3),
];

/** The right well, already digging out of what somebody sent it. */
const RIGHT: Block[] = [
  ...row(5, [1, 2, 6, 7], 4),
  ...row(4, [1, 6], 0),
];

function Well({
  x,
  blocks,
  garbageRows,
  clearRow,
}: {
  x: number;
  blocks: Block[];
  garbageRows?: number[];
  clearRow?: number;
}) {
  return (
    <g>
      <rect
        x={x - 5}
        y={TOP - 5}
        width={CELL * COLS + 10}
        height={CELL * ROWS + 10}
        rx="10"
        fill="#08080a"
        stroke="#262626"
      />
      {/* the well's own grid, faint */}
      <g stroke="#ffffff" strokeOpacity="0.04">
        {Array.from({ length: COLS - 1 }, (_, i) => (
          <line key={`v${i}`} x1={x + (i + 1) * CELL} y1={TOP} x2={x + (i + 1) * CELL} y2={TOP + ROWS * CELL} />
        ))}
      </g>

      {garbageRows?.map((r) =>
        Array.from({ length: COLS }, (_, c) =>
          c === 6 ? null : (
            <rect
              key={`g${r}-${c}`}
              x={x + c * CELL + 1}
              y={TOP + r * CELL + 1}
              width={CELL - 2}
              height={CELL - 2}
              rx="4"
              fill={GARBAGE}
            />
          ),
        ),
      )}

      {blocks.map(([c, r, color], i) => (
        <rect
          key={i}
          x={x + c * CELL + 1}
          y={TOP + r * CELL + 1}
          width={CELL - 2}
          height={CELL - 2}
          rx="4"
          fill={color}
          fillOpacity="0.92"
        />
      ))}

      {clearRow !== undefined && (
        <rect
          x={x - 4}
          y={TOP + clearRow * CELL - 3}
          width={CELL * COLS + 8}
          height={CELL + 6}
          rx="7"
          fill="#b4f953"
          fillOpacity="0.14"
          stroke="#b4f953"
          strokeOpacity="0.85"
          strokeWidth="2"
        />
      )}
    </g>
  );
}

export default function StackerHero() {
  const leftX = 96;
  const rightX = 484;
  const bottom = TOP + ROWS * CELL;

  return (
    <svg
      viewBox="0 0 800 400"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="hero-stacker-title hero-stacker-desc"
      className="w-full h-auto"
    >
      <title id="hero-stacker-title">Two Stacker wells trading garbage lines</title>
      <desc id="hero-stacker-desc">
        Two ten-column wells of falling coloured blocks side by side. A completed line in
        the left well sends grey garbage rows into the right one — the only thing that
        crosses the Nostr relay in a real-time Obelisk Stacker match.
      </desc>

      <defs>
        <radialGradient id="bg-stacker" cx="0.5" cy="0.5" r="0.78">
          <stop offset="0%" stopColor="#12161a" />
          <stop offset="100%" stopColor="#0a0a0a" />
        </radialGradient>
      </defs>

      <rect width="800" height="400" fill="url(#bg-stacker)" />

      <Well x={leftX} blocks={LEFT} clearRow={8} />
      <Well x={rightX} blocks={RIGHT} garbageRows={[6, 7, 8]} />

      {/* the attack: three lines and the column they leave open */}
      <path
        d={`M${leftX + COLS * CELL + 12} ${bottom - CELL / 2} C 380 ${bottom - CELL / 2}, 390 ${TOP + 4 * CELL}, ${rightX - 18} ${TOP + 6 * CELL + CELL / 2}`}
        fill="none"
        stroke="#b4f953"
        strokeOpacity="0.85"
        strokeWidth="2.5"
        strokeDasharray="7 6"
      />
      <polygon
        points={`${rightX - 18},${TOP + 6 * CELL + CELL / 2 - 6} ${rightX - 4},${TOP + 6 * CELL + CELL / 2} ${rightX - 18},${TOP + 6 * CELL + CELL / 2 + 6}`}
        fill="#b4f953"
      />

      <g fontWeight="600">
        <text x={leftX} y="72" fill="#fafafa" fontSize="15">Clear a line…</text>
        <text x={rightX} y="72" fill="#fafafa" fontSize="15">…and somebody else digs</text>

        <g fontFamily="ui-monospace, monospace">
          <rect x="336" y="176" width="132" height="52" rx="9" fill="#171717" stroke="#262626" />
          <text x="352" y="199" fill="#b4f953" fontSize="12">op: attack</text>
          <text x="352" y="217" fill="#a3a3a3" fontSize="11">lines 3 · hole 6</text>
        </g>

        <text x={leftX} y="368" fill="#a3a3a3" fontSize="11">
          Every board runs locally at sixty frames a second; only the consequences are published.
        </text>
      </g>
    </svg>
  );
}
