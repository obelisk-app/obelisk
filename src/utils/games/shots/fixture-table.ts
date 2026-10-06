/**
 * The machinery under the guide-screenshot fixtures: a table that publishes
 * kind 2390 events locally and re-derives its session from its own log,
 * exactly as a real client does, minus the relay; and the seeded PRNG that
 * keeps "random-looking" boards reproducible. The boards themselves are in
 * `fixtures.ts`.
 */
import { deriveSession, type GameSession } from '@/lib/games/session';
import { registerGameDef } from '@/lib/games/registry';
import type { GameDefinition } from '@/lib/games/types';
import { chainReaction } from '@/lib/games/chain-reaction';
import { vesta } from '@/lib/games/vesta/definition';
import { stacker } from '@/lib/games/stacker/definition';
import {
  buildCreate,
  buildGameOp,
  parseGameEvent,
  type GameEvent,
  type ParsedGameEvent,
  type SeatSpec,
} from '@/lib/games/protocol';

// The harness replays synchronously, so it installs every engine up front.
// (Dev only: the app loads each engine on demand, see registry.ts.)
for (const def of [chainReaction, vesta, stacker]) registerGameDef(def as unknown as GameDefinition);

const CHANNEL = 'obelisk-guides-channel';

/** Stable ids: the same fixture must produce the same screenshot every run. */
const GAME_ID = 'f'.repeat(64);

/** Fixed so nothing in here ever reads the wall clock. */
export const T0 = 1_760_000_000;

/**
 * A client that publishes and re-derives, minus the relay.
 *
 * Deliberately the same shape as the harness in `vesta/playthrough.test.ts`,
 * a table that only knows its board by replaying its own log.
 */
export class Table {
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
     * event, so this is the only handle a fixture has on what the board rolls.
     * See `vestaFixture`.
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
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
