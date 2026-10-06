/**
 * Parsing game events off the wire. A peer can put anything on a relay, so
 * nothing here throws and every number goes through `finite`. Re-exported
 * from `protocol.ts`.
 */
import { KIND_GAME } from '@/utils/nip-kinds';
import { MAX_GARBAGE_LINES } from './stacker/dimensions';
import type { GameEvent, GameOp, ParsedGameEvent, SeatSpec } from './protocol-types';

function tag(tags: string[][], name: string): string | undefined {
  return tags.find((t) => t[0] === name)?.[1];
}

/**
 * A number a peer is allowed to send. `JSON.parse('1e999')` is `Infinity`,
 * which passes `typeof === 'number'` and then floors to itself, so every
 * numeric field is read through this rather than a bare type check.
 */
function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `finite`, floored, or the fallback. */
function int(value: unknown, fallback: number): number {
  const n = finite(value);
  return n === null ? fallback : Math.floor(n);
}

/**
 * Normalize a `start` seat list. Accepts both the object form and the older
 * bare-pubkey array - a table opened by a client that predates hot-seat is
 * simply a table where every seat is its own controller.
 */
export function parseSeats(raw: unknown): SeatSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: SeatSpec[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    let spec: SeatSpec | null = null;
    if (typeof entry === 'string' && entry.length > 0) {
      spec = { id: entry, by: entry };
    } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      const e = entry as { id?: unknown; by?: unknown; label?: unknown };
      if (typeof e.id === 'string' && e.id.length > 0 && typeof e.by === 'string' && e.by.length > 0) {
        spec = {
          id: e.id,
          by: e.by,
          ...(typeof e.label === 'string' && e.label.length > 0 ? { label: e.label } : {}),
        };
      }
    }
    if (!spec || seen.has(spec.id)) continue;
    seen.add(spec.id);
    out.push(spec);
  }
  return out;
}

/**
 * Parse a raw relay event into a game op, or `null` if it is not one of ours /
 * is malformed. Never throws - a peer can put anything on the wire.
 */
export function parseGameEvent(ev: GameEvent): ParsedGameEvent | null {
  if (ev.kind !== KIND_GAME) return null;
  const channelId = tag(ev.tags, 'h');
  if (!channelId) return null;
  const op = tag(ev.tags, 'op') as GameOp | undefined;
  if (!op) return null;

  let body: Record<string, unknown> = {};
  if (ev.content) {
    try {
      const parsed: unknown = JSON.parse(ev.content);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      body = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  const base = { id: ev.id, pubkey: ev.pubkey, createdAt: ev.created_at, channelId };

  if (op === 'create') {
    const game = typeof body.game === 'string' ? body.game : tag(ev.tags, 'game');
    if (!game) return null;
    const turnTimeoutS = Math.max(0, int(body.turnTimeoutS, 0));
    const opts = body.opts && typeof body.opts === 'object' && !Array.isArray(body.opts)
      ? (body.opts as Record<string, unknown>)
      : {};
    return {
      ...base,
      gameId: ev.id,
      op,
      game,
      opts,
      turnTimeoutS,
      ...(typeof body.nonce === 'string' ? { nonce: body.nonce } : {}),
    };
  }

  const gameId = ev.tags.find((t) => t[0] === 'e' && typeof t[1] === 'string' && t[1].length > 0)?.[1];
  if (!gameId) return null;

  switch (op) {
    case 'join':
      return { ...base, gameId, op };
    case 'start': {
      const seats = parseSeats(body.seats);
      if (seats.length === 0) return null;
      return { ...base, gameId, op, seats };
    }
    case 'move': {
      if (typeof body.n !== 'number' || !Number.isInteger(body.n) || body.n < 0) return null;
      if (body.action === undefined) return null;
      return {
        ...base,
        gameId,
        op,
        n: body.n,
        action: body.action,
        ...(typeof body.seat === 'string' && body.seat.length > 0 ? { seat: body.seat } : {}),
      };
    }
    case 'timeout': {
      if (typeof body.n !== 'number' || !Number.isInteger(body.n) || body.n < 0) return null;
      return { ...base, gameId, op, n: body.n };
    }
    case 'attack': {
      const seat = typeof body.seat === 'string' ? body.seat : ev.pubkey;
      const target = typeof body.target === 'string' ? body.target : '';
      // Capped here as well as in the engine: the match state records the
      // number as sent, and a spectator's mini-board reads it from there.
      const lines = Math.min(MAX_GARBAGE_LINES, int(body.lines, 0));
      if (!target || lines <= 0) return null;
      return {
        ...base,
        gameId,
        op,
        seat,
        target,
        lines,
        hole: Math.abs(int(body.hole, 0)),
        nonce: finite(body.nonce) ?? 0,
      };
    }

    case 'topout':
      return { ...base, gameId, op, seat: typeof body.seat === 'string' ? body.seat : ev.pubkey };

    case 'checkpoint': {
      const frame = finite(body.frame);
      if (frame === null) return null;
      return {
        ...base,
        gameId,
        op,
        seat: typeof body.seat === 'string' ? body.seat : ev.pubkey,
        frame: Math.floor(frame),
        attacksSent: int(body.attacksSent, 0),
        linesCleared: int(body.linesCleared, 0),
        stackHeight: int(body.stackHeight, 0),
        ...(typeof body.inputs === 'string' ? { inputs: body.inputs } : {}),
        ...(typeof body.board === 'string' ? { board: body.board } : {}),
      };
    }

    case 'resign':
      return {
        ...base,
        gameId,
        op,
        ...(typeof body.seat === 'string' && body.seat.length > 0 ? { seat: body.seat } : {}),
      };
    case 'cancel':
      return { ...base, gameId, op };
    default:
      return null;
  }
}
