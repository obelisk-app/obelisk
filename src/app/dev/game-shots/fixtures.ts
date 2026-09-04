/**
 * Boards for the guide screenshots.
 *
 * Nothing here is hand-drawn. Every board is produced the way a real table
 * produces one: build a kind 2390 log, hand it to `deriveSession`, and render
 * whatever comes back. A screenshot taken from these fixtures is a screenshot
 * of the shipped engine — if the rules change under it, the picture changes
 * with them, which is the whole reason not to mock the state.
 *
 * The only thing that is faked is the relay: the events are built and parsed
 * locally instead of being signed and published.
 */
import { getValidPositions, type GameState as VestaState } from 'vesta';
import { isRobberPending } from '@/lib/games/vesta/definition';
import { deriveSession, type GameSession } from '@/lib/games/session';
import {
  buildCreate,
  buildGameOp,
  parseGameEvent,
  type GameEvent,
  type ParsedGameEvent,
  type SeatSpec,
} from '@/lib/games/protocol';
import type { CRState } from '@/lib/games/chain-reaction';
import { vertices, edges } from '@/lib/games/vesta/geometry';
import { createState, encodeBoard, step, type GameState as StackerState } from '@/lib/games/stacker/engine';
import type { MatchState } from '@/lib/games/stacker/match';

const CHANNEL = 'obelisk-guides-channel';

/** Stable ids: the same fixture must produce the same screenshot every run. */
const GAME_ID = 'f'.repeat(64);

/** Fixed so nothing in here ever reads the wall clock. */
const T0 = 1_760_000_000;

/**
 * A client that publishes and re-derives, minus the relay.
 *
 * Deliberately the same shape as the harness in `vesta/playthrough.test.ts` —
 * a table that only knows its board by replaying its own log.
 */
class Table {
  private log: ParsedGameEvent[] = [];
  private clock = T0;
  private seq = 0;

  constructor(
    game: string,
    private readonly seats: SeatSpec[],
    opts: Record<string, unknown> = {},
    turnTimeoutS = 0,
    /**
     * Salts the move ids. Vesta's dice come from the id of the last accepted
     * event, so this is the only handle a fixture has on what the board rolls
     * — see `vestaFixture`.
     */
    private readonly idPrefix = 'm',
  ) {
    const host = seats[0].by;
    this.push(GAME_ID, host, buildCreate(CHANNEL, { game, opts, turnTimeoutS }));
    const joined = new Set([host]);
    for (const seat of seats) {
      if (joined.has(seat.by)) continue;
      joined.add(seat.by);
      this.push(`join-${seat.by}`, seat.by, buildGameOp(CHANNEL, GAME_ID, 'join'));
    }
    this.push('start', host, buildGameOp(CHANNEL, GAME_ID, 'start', { seats }));
  }

  private push(id: string, pubkey: string, template: { kind: number; content: string; tags: string[][] }) {
    const ev: GameEvent = {
      id,
      pubkey,
      created_at: this.clock++,
      kind: template.kind,
      tags: template.tags,
      content: template.content,
    };
    const parsed = parseGameEvent(ev);
    if (!parsed) throw new Error(`fixture published an unparseable event: ${template.content}`);
    this.log.push(parsed);
  }

  session(): GameSession {
    const s = deriveSession(this.log, T0 + 100_000);
    if (!s) throw new Error('fixture log derived no session');
    return s;
  }

  /** Publish a move as the seat currently on move, exactly as the UI does. */
  move(action: unknown, seat?: string): GameSession {
    const s = this.session();
    const actingSeat = seat ?? s.currentTurn;
    if (!actingSeat) throw new Error('fixture moved on a table with nobody to move');
    const controller = this.seats.find((x) => x.id === actingSeat)?.by ?? actingSeat;
    this.push(
      `${this.idPrefix}${this.seq++}`,
      controller,
      buildGameOp(CHANNEL, GAME_ID, 'move', { n: s.turnIndex, action, seat: actingSeat }),
    );
    return this.session();
  }

  /** A real-time op (attack / topout / checkpoint), published by its seat. */
  realtime(op: 'attack' | 'topout' | 'checkpoint', payload: Record<string, unknown>): GameSession {
    const seat = payload.seat as string;
    const controller = this.seats.find((x) => x.id === seat)?.by ?? seat;
    this.push(`rt${this.seq++}`, controller, buildGameOp(CHANNEL, GAME_ID, op, payload));
    return this.session();
  }
}

/* ── deterministic choice ───────────────────────────────────────────────── */

/** Same PRNG upstream uses, so "random-looking" stays reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── Chain Reaction ─────────────────────────────────────────────────────── */

export const CR_SEATS: SeatSpec[] = [
  { id: 'seat-ana', by: 'pk-ana', label: 'Ana' },
  { id: 'seat-bruno', by: 'pk-bruno', label: 'Bruno' },
  { id: 'seat-cami', by: 'pk-cami', label: 'Cami' },
];

/**
 * A three-player board deep enough that most cells are contested and several
 * are one orb from going critical — the moment the game actually looks like
 * what it is.
 */
export function chainReactionFixture(turns = 52): GameSession {
  const table = new Table('chain-reaction', CR_SEATS, { size: 'medium' }, 45);
  const rand = mulberry32(7);

  let session = table.session();
  for (let i = 0; i < turns; i++) {
    const state = session.state as CRState;
    const seat = session.currentTurn;
    if (!seat || session.status !== 'in_progress') break;
    const mine = state.seats[seat];

    // Legal cells only: empty, or already ours. Prefer a cell that is one orb
    // short of critical, so the board keeps its cascades loaded.
    const legal: number[] = [];
    for (let c = 0; c < state.cells.length; c++) {
      const cell = state.cells[c];
      if (cell.owner === null || cell.owner === mine) legal.push(c);
    }
    if (legal.length === 0) break;
    session = table.move({ cell: legal[Math.floor(rand() * legal.length)] });
  }
  return session;
}

/* ── Vesta ──────────────────────────────────────────────────────────────── */

export const VESTA_SEATS: SeatSpec[] = [
  { id: 'seat-ana', by: 'pk-ana', label: 'Ana' },
  { id: 'seat-bruno', by: 'pk-bruno', label: 'Bruno' },
  { id: 'seat-cami', by: 'pk-cami', label: 'Cami' },
];

/**
 * A board past the setup snake, with the dice already rolled — so the
 * screenshot shows settlements, roads, and a hand, rather than an empty
 * island nobody has touched.
 */
export function vestaFixture(): GameSession {
  // The dice are derived from the log, so the only way to photograph an
  // ordinary turn rather than a seven (robber, discards, a modal question) is
  // to salt the move ids until the log rolls something else. Deterministic:
  // the first salt that works is the same one on every run.
  for (const salt of ['m', 'n', 'p', 'q', 'r', 's']) {
    const session = vestaTable(salt);
    if (session) return session;
  }
  // Every salt rolled a seven — show the seven rather than nothing.
  return vestaTable('m', true)!;
}

function vestaTable(salt: string, acceptSeven = false): GameSession | null {
  const table = new Table('vesta', VESTA_SEATS, { seed: 42 }, 0, salt);

  // The setup snake: every seat places settlement + road, twice.
  for (let i = 0; i < VESTA_SEATS.length * 2; i++) {
    const state = table.session().state as VestaState;
    const spotKey = getValidPositions(state, 'initial-settlement')[0];
    const vertex = vertices().get(spotKey.key);
    if (!vertex) break;
    const hex = vertex.hexes[0];
    table.move({ type: 'place-settlement', q: hex.q, r: hex.r, corner: hex.corner });

    const roadKey = getValidPositions(table.session().state as VestaState, 'initial-road')[0];
    const edge = edges().get(roadKey.key);
    if (!edge) break;
    table.move({
      type: 'place-road',
      q1: edge.hex.q, r1: edge.hex.r, corner1: edge.hex.c1,
      q2: edge.hex.q, r2: edge.hex.r, corner2: edge.hex.c2,
    });
  }

  const afterSetup = table.session();
  if ((afterSetup.state as VestaState).phase !== 'play') return afterSetup;

  // First real turn: roll, so the hand on screen came from the board.
  const rolled = table.move({ type: 'roll-dice' });
  if (!acceptSeven && isRobberPending(rolled.state as VestaState)) return null;
  return rolled;
}

/* ── Stacker ────────────────────────────────────────────────────────────── */

export const STACKER_SEATS: SeatSpec[] = [
  { id: 'seat-ana', by: 'pk-ana', label: 'Ana' },
  { id: 'seat-bruno', by: 'pk-bruno', label: 'Bruno' },
  { id: 'seat-cami', by: 'pk-cami', label: 'Cami' },
];

/**
 * Run the real engine headlessly to produce an opponent's well.
 *
 * Opponent boards travel as `encodeBoard` strings inside checkpoints, so the
 * honest way to fake one is to actually play it: drop pieces down alternating
 * columns until the stack has some height and some holes.
 */
function playedBoard(seed: number, drops: number): StackerState {
  let state = createState(seed);
  const rand = mulberry32(seed);
  let frame = 0;
  for (let i = 0; i < drops; i++) {
    const shift = Math.floor(rand() * 9) - 4;
    for (let s = 0; s < Math.abs(shift); s++) {
      state = step(state, { frame: frame++, kind: shift < 0 ? 'left' : 'right' });
    }
    if (rand() > 0.6) state = step(state, { frame: frame++, kind: 'cw' });
    state = step(state, { frame: frame++, kind: 'hard' });
    if (state.dead) break;
  }
  return state;
}

/**
 * One well, mid-match: real pieces, real garbage, nobody dead.
 *
 * The table shot below photographs the live UI, keystrokes and all. This one
 * exists because a still of the playfield wants a stack that has been played
 * for a while, and playing that live in a screenshot script means racing the
 * gravity curve. Same engine either way — `step()` is the only thing that
 * ever writes to a board.
 */
export function stackerWell(): StackerState {
  return playedBoard(17, 16);
}

/**
 * A live three-way match: two opponents with real wells behind them, garbage
 * already in flight, and one seat already buried.
 */
export function stackerFixture(): { session: GameSession; match: MatchState } {
  const table = new Table('stacker', STACKER_SEATS, { seed: 4242 }, 0);
  const [ana, bruno, cami] = STACKER_SEATS.map((s) => s.id);

  const brunoBoard = playedBoard(11, 22);
  const camiBoard = playedBoard(29, 34);

  table.realtime('checkpoint', {
    seat: bruno,
    frame: 3600,
    attacksSent: 7,
    linesCleared: 21,
    stackHeight: 9,
    board: encodeBoard(brunoBoard),
  });
  table.realtime('checkpoint', {
    seat: cami,
    frame: 3600,
    attacksSent: 3,
    linesCleared: 12,
    stackHeight: 15,
    board: encodeBoard(camiBoard),
  });
  table.realtime('attack', { seat: bruno, target: ana, lines: 2, hole: 3, nonce: 1 });
  table.realtime('attack', { seat: cami, target: ana, lines: 1, hole: 7, nonce: 2 });

  const session = table.realtime('checkpoint', {
    seat: ana,
    frame: 3600,
    attacksSent: 11,
    linesCleared: 30,
    stackHeight: 6,
    board: encodeBoard(playedBoard(5, 12)),
  });

  if (!session.match) throw new Error('stacker fixture derived no match');
  return { session, match: session.match };
}

/* ── a finished table, for the results panel ────────────────────────────── */

/** Chain Reaction played to the end, so the standings have something to say. */
export function finishedChainReaction(): GameSession {
  const table = new Table('chain-reaction', CR_SEATS.slice(0, 2), { size: 'small' }, 45);
  const rand = mulberry32(3);
  let session = table.session();

  for (let i = 0; i < 300 && session.status === 'in_progress'; i++) {
    const state = session.state as CRState;
    const seat = session.currentTurn;
    if (!seat) break;
    const mine = state.seats[seat];
    const legal: number[] = [];
    for (let c = 0; c < state.cells.length; c++) {
      const cell = state.cells[c];
      if (cell.owner === null || cell.owner === mine) legal.push(c);
    }
    if (legal.length === 0) break;
    session = table.move({ cell: legal[Math.floor(rand() * legal.length)] });
  }
  return session;
}

/** Names for the seat labels the boards render. */
export function seatLabel(seatId: string): string {
  const all = [...CR_SEATS, ...VESTA_SEATS, ...STACKER_SEATS];
  return all.find((s) => s.id === seatId)?.label ?? seatId.slice(0, 8);
}
