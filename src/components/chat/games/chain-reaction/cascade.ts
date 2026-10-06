/**
 * Local replay of a Chain Reaction cascade.
 *
 * A move event carries only the clicked cell; the reducer hands the board
 * the settled post-cascade state. To show the explosions, the board re-runs
 * the cascade here, round by round, from the previous board.
 */

export type CellSnapshot = { count: number; owner: number | null };

export function neighborIndices(rows: number, cols: number, i: number): number[] {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  if (r > 0) out.push((r - 1) * cols + c);
  if (r < rows - 1) out.push((r + 1) * cols + c);
  if (c > 0) out.push(r * cols + (c - 1));
  if (c < cols - 1) out.push(r * cols + (c + 1));
  return out;
}

// One BFS round: every currently-critical cell explodes simultaneously.
// Returns null when nothing is critical any more.
export function oneCascadeRound(
  cells: CellSnapshot[],
  rows: number,
  cols: number,
  actorSeat: number,
): { cells: CellSnapshot[]; exploded: number[] } | null {
  const exploding: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].count >= neighborIndices(rows, cols, i).length) exploding.push(i);
  }
  if (exploding.length === 0) return null;
  const next = cells.map((c) => ({ ...c }));
  for (const i of exploding) {
    const crit = neighborIndices(rows, cols, i).length;
    next[i].count -= crit;
    if (next[i].count <= 0) { next[i].count = 0; next[i].owner = null; }
  }
  for (const i of exploding) {
    for (const n of neighborIndices(rows, cols, i)) {
      next[n].count += 1;
      next[n].owner = actorSeat;
    }
  }
  return { cells: next, exploded: exploding };
}

// Full cascade, used to brute-force which cell was clicked for opponents.
export function simulateFull(
  prev: CellSnapshot[],
  rows: number,
  cols: number,
  actorSeat: number,
  clickCell: number,
): CellSnapshot[] {
  const start = prev.map((c) => ({ ...c }));
  start[clickCell] = { count: start[clickCell].count + 1, owner: actorSeat };
  let cur = start;
  for (let guard = 0; guard < 400; guard++) {
    const step = oneCascadeRound(cur, rows, cols, actorSeat);
    if (!step) break;
    cur = step.cells;
  }
  return cur;
}

// Our simulator ignores the engine's dominance-break optimisation, so in
// end-game positions the states can diverge. We consider them equal if every
// non-zero cell matches: close enough to pick the right click.
export function cellsRoughlyEqual(a: CellSnapshot[], b: CellSnapshot[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].count !== b[i].count) return false;
    if (a[i].owner !== b[i].owner) return false;
  }
  return true;
}

/**
 * How closely a simulated board resembles the real one.
 *
 * The engine stops a cascade the moment the mover owns everything
 * (`isDominant` in chain-reaction.ts), so on the winning move (and only on
 * the winning move) a full local simulation always overshoots and nothing
 * matches exactly. That used to mean the biggest explosion in the game was
 * the one nobody got to watch. Scoring the candidates lets us animate the
 * closest one and snap to the authoritative board at the end.
 */
export function matchScore(a: CellSnapshot[], b: CellSnapshot[]): number {
  let score = 0;
  for (let i = 0; i < a.length && i < b.length; i++) {
    if (a[i].owner === b[i].owner) score += 1;
    if (a[i].count === b[i].count) score += 1;
  }
  return score;
}

/**
 * Which cell a remote mover clicked: the first legal cell whose full
 * simulation reproduces the observed board, or failing that the closest one.
 * -1 when no cell is legal.
 */
export function findClickedCell(
  prev: CellSnapshot[],
  next: CellSnapshot[],
  rows: number,
  cols: number,
  actorSeat: number,
): number {
  let best = -1;
  let bestScore = -1;
  for (let i = 0; i < prev.length; i++) {
    if (prev[i].owner !== null && prev[i].owner !== actorSeat) continue;
    const sim = simulateFull(prev, rows, cols, actorSeat, i);
    if (cellsRoughlyEqual(sim, next)) return i;
    const score = matchScore(sim, next);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  // No exact match: the winning move, where the engine cut the cascade
  // short. Animate the closest candidate rather than snapping silently.
  return best;
}

export type CascadeFrame = { cells: CellSnapshot[]; exploded: number[] };

/** Step-by-step frames: [placed, after-round-1, after-round-2, ...]. */
export function cascadeFrames(
  prev: CellSnapshot[],
  rows: number,
  cols: number,
  actorSeat: number,
  clickCell: number,
): CascadeFrame[] {
  const frames: CascadeFrame[] = [];
  const placed = prev.map((c) => ({ ...c }));
  placed[clickCell] = { count: placed[clickCell].count + 1, owner: actorSeat };
  frames.push({ cells: placed, exploded: [] });

  let current = placed;
  for (let guard = 0; guard < 400; guard++) {
    const step = oneCascadeRound(current, rows, cols, actorSeat);
    if (!step) break;
    frames.push(step);
    current = step.cells;
  }
  return frames;
}

/** Whether any cell's count or owner differs. */
export function boardChanged(prev: CellSnapshot[], next: CellSnapshot[]): boolean {
  for (let i = 0; i < next.length; i++) {
    if (next[i].count !== prev[i].count || next[i].owner !== prev[i].owner) return true;
  }
  return false;
}
