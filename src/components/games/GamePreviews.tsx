// Small SVG thumbnails for the /jugar picker. Mirror the real board look
// (lime-green X, red O on lc-dark cells with rounded corners) so the
// preview matches what the user will actually see when the game opens.

export function TicTacToePreview({ size = 56 }: { size?: number }) {
  // A fixed "mid-game" snapshot that reads as tic-tac-toe at a glance.
  // Row-major cells (0..8): X at 0, O at 4, X at 2, O at 6.
  const cells: Array<'X' | 'O' | null> = ['X', null, 'X', null, 'O', null, 'O', null, null];
  const gap = 2;
  const cell = (size - gap * 2) / 3;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Vista previa Tic-Tac-Toe"
      className="shrink-0"
    >
      {cells.map((mark, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = col * (cell + gap);
        const y = row * (cell + gap);
        return (
          <g key={i}>
            <rect x={x} y={y} width={cell} height={cell} rx={3} ry={3} fill="#262626" />
            {mark === 'X' && <XMark x={x} y={y} size={cell} />}
            {mark === 'O' && <OMark x={x} y={y} size={cell} />}
          </g>
        );
      })}
    </svg>
  );
}

function XMark({ x, y, size }: { x: number; y: number; size: number }) {
  const pad = size * 0.22;
  return (
    <g stroke="#b4f953" strokeWidth={Math.max(1.5, size * 0.12)} strokeLinecap="round">
      <line x1={x + pad} y1={y + pad} x2={x + size - pad} y2={y + size - pad} />
      <line x1={x + size - pad} y1={y + pad} x2={x + pad} y2={y + size - pad} />
    </g>
  );
}

function OMark({ x, y, size }: { x: number; y: number; size: number }) {
  const r = size * 0.28;
  return (
    <circle
      cx={x + size / 2}
      cy={y + size / 2}
      r={r}
      fill="none"
      stroke="#f87171"
      strokeWidth={Math.max(1.5, size * 0.12)}
    />
  );
}

export function ChainReactionPreview({ size = 56 }: { size?: number }) {
  // 4×5 mid-game snapshot: a few cells stacked with orbs of different
  // colors, evoking the packed-grid look of the real board.
  const cols = 4;
  const rows = 5;
  const gap = 1.5;
  const cell = (size - gap * (cols - 1)) / cols;
  // [cellIndex, count, colorIdx]
  const stamps: Array<[number, number, number]> = [
    [0, 1, 0], [2, 2, 1], [3, 1, 1],
    [5, 3, 0], [6, 1, 2],
    [9, 2, 2], [10, 1, 0],
    [13, 1, 1], [14, 2, 3],
    [17, 1, 3], [18, 1, 0],
  ];
  const palette = ['#ef4444', '#b4f953', '#60a5fa', '#facc15'];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Vista previa Chain Reaction"
      className="shrink-0"
    >
      <rect x={0} y={0} width={size} height={size} rx={4} ry={4} fill="#0a0a0a" />
      {Array.from({ length: cols * rows }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = col * (cell + gap);
        const y = row * (cell + gap);
        const stamp = stamps.find(([idx]) => idx === i);
        return (
          <g key={i}>
            <rect x={x} y={y} width={cell} height={cell} rx={2} ry={2} fill="#171717" stroke="#262626" strokeWidth={0.5} />
            {stamp && <OrbGroup x={x} y={y} cell={cell} count={stamp[1]} color={palette[stamp[2]]} />}
          </g>
        );
      })}
    </svg>
  );
}

function OrbGroup({ x, y, cell, count, color }: { x: number; y: number; cell: number; count: number; color: string }) {
  const cx = x + cell / 2;
  const cy = y + cell / 2;
  const r = Math.max(1.5, cell * 0.18);
  const d = cell * 0.18;
  const positions: Array<[number, number]> =
    count === 1 ? [[0, 0]]
    : count === 2 ? [[-d, 0], [d, 0]]
    : [[-d, d * 0.6], [d, d * 0.6], [0, -d]];
  const gradId = `crg-${color.replace('#', '')}-${count}-${Math.round(x)}-${Math.round(y)}`;
  return (
    <g>
      <defs>
        <radialGradient id={gradId} cx="30%" cy="28%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.9} />
          <stop offset="45%" stopColor={color} />
          <stop offset="100%" stopColor="#000000" stopOpacity={0.55} />
        </radialGradient>
      </defs>
      {positions.map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx} cy={cy + dy} r={r} fill={`url(#${gradId})`} />
      ))}
    </g>
  );
}

export function ChessPreview({ size = 56 }: { size?: number }) {
  // 4×4 mini-board snapshot evoking an opening mid-position. Uses the same
  // dark/darker pair as the real ChessBoard component.
  const n = 4;
  const cell = size / n;
  // Piece stamps: [cellIndex (row*n + col, row 0 = top = black), glyph, color]
  const stamps: Array<[number, string, 'w' | 'b']> = [
    [0, '♜', 'b'], [1, '♛', 'b'], [2, '♚', 'b'], [3, '♜', 'b'],
    [5, '♟', 'b'], [6, '♟', 'b'],
    [9, '♙', 'w'], [10, '♙', 'w'],
    [12, '♖', 'w'], [13, '♕', 'w'], [14, '♔', 'w'], [15, '♖', 'w'],
  ];

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Vista previa Ajedrez"
      className="shrink-0"
    >
      {Array.from({ length: n * n }, (_, i) => {
        const col = i % n;
        const row = Math.floor(i / n);
        const light = (row + col) % 2 === 1;
        const x = col * cell;
        const y = row * cell;
        const stamp = stamps.find(([idx]) => idx === i);
        return (
          <g key={i}>
            <rect x={x} y={y} width={cell} height={cell} fill={light ? '#2a2a2a' : '#1a1a1a'} />
            {stamp && (
              <text
                x={x + cell / 2}
                y={y + cell / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cell * 0.78}
                fill={stamp[2] === 'w' ? '#fafafa' : '#0a0a0a'}
                style={{ fontFamily: 'serif' }}
              >{stamp[1]}</text>
            )}
          </g>
        );
      })}
      <rect x={0.5} y={0.5} width={size - 1} height={size - 1} fill="none" stroke="#262626" strokeWidth={1} rx={3} ry={3} />
    </svg>
  );
}

export function GameTypePreview({ type, size = 56 }: { type: string; size?: number }) {
  if (type === 'tic-tac-toe') return <TicTacToePreview size={size} />;
  if (type === 'chain-reaction') return <ChainReactionPreview size={size} />;
  if (type === 'chess') return <ChessPreview size={size} />;
  return (
    <div
      className="rounded-md bg-lc-border/50 flex items-center justify-center text-lc-muted"
      style={{ width: size, height: size }}
    >
      🎮
    </div>
  );
}
