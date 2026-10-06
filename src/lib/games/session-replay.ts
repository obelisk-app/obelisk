/**
 * The replay proper: a table's event log in, a `GameSession` out. The
 * ordering and trust rules are documented on `session.ts`, which re-exports
 * `replayLog` and adds the one clock-dependent read on top.
 */
import { getGameDef } from './registry';
import { applyMatchEvent, initialMatch } from './stacker/match';
import type { ParsedGameEvent } from './protocol';
import type { GameSession } from './session-types';
import { resolveSeat } from './session-queries';

/**
 * Run one engine call and treat a throw as "the engine rejected this".
 *
 * `types.ts` asks engines to be total, but the log is peer input and an
 * engine is ordinary code: a float where an index was expected, or a resumed
 * state shaped by somebody else's client, can make one throw. Letting that
 * escape took the whole table down for every client replaying it, which is
 * a worse outcome than the illegal event achieving nothing.
 */
function engineCall<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

function sortLog(events: readonly ParsedGameEvent[]): ParsedGameEvent[] {
  return [...events].sort((a, b) =>
    a.createdAt !== b.createdAt ? a.createdAt - b.createdAt : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/**
 * The replay proper: log in, board out, and **no wall clock anywhere**.
 *
 * That missing `now` parameter is load-bearing, not an oversight. The store
 * caches this function's result keyed by the identity of the log array it was
 * given (`selectSession` in `src/store/games.ts`), which is only sound while
 * the output depends on nothing but the log. Reading the clock in here would
 * silently make that cache wrong - a card would keep rendering whatever the
 * clock said the first time it was derived. Anything time-dependent belongs in
 * {@link applyWaitingExpiry}, which runs on every read.
 */
export function replayLog(events: readonly ParsedGameEvent[]): GameSession | null {
  const log = sortLog(events);
  const create = log.find((e) => e.op === 'create');
  if (!create || create.op !== 'create') return null;

  const def = getGameDef(create.game);
  if (!def) return null;

  const session: GameSession = {
    id: create.gameId,
    channelId: create.channelId,
    game: create.game,
    status: 'waiting',
    createdBy: create.pubkey,
    createdAt: create.createdAt,
    opts: create.opts,
    turnTimeoutS: create.turnTimeoutS,
    minPlayers: def.minPlayers,
    maxPlayers: def.maxPlayers,
    participants: [],
    seats: [],
    // The host holds seat 0 without having to publish a separate join.
    joined: [create.pubkey],
    state: null,
    currentTurn: null,
    turnIndex: 0,
    turnStartedAt: null,
    turnDeadline: null,
    winner: null,
    draw: false,
    eliminated: [],
    finishedAt: null,
    match: null,
  };

  // Entropy chain for engines that need a die roll. It is seeded by the table
  // id and advanced by every accepted event, so the value for turn N is fixed
  // by events published BEFORE that turn - the player about to roll cannot
  // grind it. See docs/games.md.
  let lastAcceptedId = create.id;

  const setTurn = (pubkey: string | null, at: number) => {
    session.currentTurn = pubkey;
    session.turnStartedAt = pubkey ? at : null;
    session.turnDeadline = pubkey && session.turnTimeoutS > 0 ? at + session.turnTimeoutS : null;
  };

  const finish = (winner: string | null, draw: boolean, at: number) => {
    session.status = 'finished';
    session.winner = winner;
    session.draw = draw;
    session.finishedAt = at;
    setTurn(null, at);
  };

  const applyResult = (
    result: ReturnType<typeof def.applyAction>,
    at: number,
  ) => {
    session.state = result.state;
    for (const pk of result.eliminated ?? []) {
      if (!session.eliminated.includes(pk)) session.eliminated.push(pk);
    }
    if (result.nextTurn === null) {
      finish(result.winner ?? null, result.draw ?? false, at);
    } else {
      session.turnIndex += 1;
      setTurn(result.nextTurn, at);
    }
  };

  for (const ev of log) {
    if (session.status === 'finished' || session.status === 'cancelled') break;

    switch (ev.op) {
      case 'create':
        break;

      case 'join': {
        if (session.status !== 'waiting') break;
        if (session.joined.includes(ev.pubkey)) break;
        if (session.joined.length >= session.maxPlayers) break;
        session.joined.push(ev.pubkey);
        break;
      }

      case 'cancel': {
        // Only the host can call off a table, and only before it starts.
        if (ev.pubkey !== session.createdBy || session.status !== 'waiting') break;
        session.status = 'cancelled';
        session.finishedAt = ev.createdAt;
        break;
      }

      case 'start': {
        if (session.status !== 'waiting') break;
        if (ev.pubkey !== session.createdBy) break;
        // The host's seat list is authoritative for ORDER, but every seat has
        // to be controlled by someone who actually asked to play - otherwise a
        // host could drag a bystander into a match (and into its timeouts).
        // Extra seats controlled by a player who DID join are fine: that is
        // exactly what hot-seat is.
        let seats = ev.seats.filter((seat) => session.joined.includes(seat.by));
        if (def.realtime) {
          // One board per account. A real-time game has every player moving at
          // once, so two seats on one keyboard is not hot-seat - it is a board
          // nobody is playing, which would keep the match alive forever.
          const seen = new Set<string>();
          seats = seats.filter((seat) => {
            if (seen.has(seat.by)) return false;
            seen.add(seat.by);
            return true;
          });
        }
        if (seats.length < session.minPlayers || seats.length > session.maxPlayers) break;
        session.seats = seats;
        session.participants = seats.map((seat) => seat.id);
        session.status = 'in_progress';
        session.turnIndex = 0;
        if (def.realtime) {
          // Nobody is "to move" in a real-time match: every board runs at once.
          session.match = initialMatch(realtimeSeed(session), session.participants);
          session.state = null;
          setTurn(null, ev.createdAt);
          session.startedAt = ev.createdAt;
        } else {
          const initial = engineCall(() => def.initialState(session.participants, session.opts));
          if (initial === undefined) {
            // The host's opts broke the engine (a malformed resume, say). The
            // table stays `waiting` rather than taking every client down.
            session.seats = [];
            session.participants = [];
            session.status = 'waiting';
            break;
          }
          session.state = initial;
          setTurn(def.firstTurn(session.participants), ev.createdAt);
        }
        break;
      }

      case 'move': {
        if (session.status !== 'in_progress' || !session.currentTurn) break;
        if (ev.n !== session.turnIndex) break;
        // The mover is authorized by CONTROLLER, but the move is attributed to
        // the SEAT. On an all-remote table those are the same string; on a
        // hot-seat table one pubkey legitimately moves for several seats, so
        // the move names which one it is playing.
        const seat = resolveSeat(session, ev.pubkey, ev.seat);
        if (!seat) break;
        const onMove = seat === session.currentTurn;
        // Engines that allow out-of-turn actions (a trade partner answering,
        // a player discarding on a seven) get the final say.
        if (!onMove && !engineCall(() => def.canAct?.(session.state, seat, ev.action, session.participants))) break;
        const check = engineCall(() => def.validateAction(session.state, ev.action, seat, session.participants));
        if (!check?.ok) break;
        const applied = engineCall(() =>
          def.applyAction(session.state, ev.action, seat, session.participants, {
            entropy: `${lastAcceptedId}:${session.turnIndex}`,
          }),
        );
        if (applied === undefined) break;
        applyResult(applied, ev.createdAt);
        lastAcceptedId = ev.id;
        break;
      }

      case 'timeout': {
        if (session.status !== 'in_progress' || !session.currentTurn) break;
        if (ev.n !== session.turnIndex) break;
        // No clock on this table means no timeouts, ever.
        if (session.turnDeadline === null) break;
        // The claim has to have been published after the deadline it claims.
        // A relay that hands us a claim stamped earlier is handing us a lie.
        if (ev.createdAt < session.turnDeadline) break;
        // Anyone at the table may call the clock - including a spectator's
        // client on behalf of the room. Restricting it to participants would
        // stall a two-player game where the remaining player has the tab shut.
        const expired = session.currentTurn;
        const timedOut = engineCall(() => def.onTimeout(session.state, expired, session.participants));
        if (timedOut === undefined) break;
        applyResult(timedOut, ev.createdAt);
        lastAcceptedId = ev.id;
        break;
      }

      case 'attack':
      case 'topout':
      case 'checkpoint': {
        if (!session.match || session.status !== 'in_progress') break;
        // Same attribution rule as a turn-based move: an event only speaks for
        // a seat whose controller signed it.
        const seat = resolveSeat(session, ev.pubkey, ev.seat);
        if (!seat || seat !== ev.seat) break;
        session.match = applyMatchEvent(session.match, { ...ev, at: ev.createdAt } as Parameters<typeof applyMatchEvent>[1]);
        if (session.match.over) {
          // No winner is only a draw when there was somebody to draw WITH. A
          // solo run ends with nobody winning because nobody else was playing;
          // recording that as a draw told a player who had just lost with a
          // score on the board that nobody took it.
          const drawn = session.match.winner === null && session.participants.length > 1;
          finish(session.match.winner, drawn, ev.createdAt);
        }
        break;
      }

      case 'resign': {
        if (session.status !== 'in_progress') break;
        // A controller may hold several seats, so a resign names one. Without
        // a name it means "the seat I hold", which is unambiguous for the
        // ordinary one-seat-per-person table.
        const held = session.seats.filter((s2) => s2.by === ev.pubkey).map((s2) => s2.id);
        const target = ev.seat && held.includes(ev.seat) ? ev.seat : held.length === 1 ? held[0] : null;
        if (!target) break;
        if (session.eliminated.includes(target)) break;
        const wasOnMove = target === session.currentTurn;
        const before = session.currentTurn;
        const result = engineCall(() => def.onTimeout(session.state, target, session.participants));
        if (result === undefined) break;
        applyResult(result, ev.createdAt);
        // Resigning out of turn must not steal the turn from whoever is on
        // move: `onTimeout` hands back the seat after the resigner, which is
        // only the right answer when the resigner was the one to move.
        if (!wasOnMove && session.status === 'in_progress' && before && !session.eliminated.includes(before)) {
          session.turnIndex -= 1;
          setTurn(before, session.turnStartedAt ?? ev.createdAt);
        }
        lastAcceptedId = ev.id;
        break;
      }
    }
  }

  return session;
}

/**
 * Seed for a real-time match. Taken from the create event's opts when the host
 * chose one, otherwise from the table id itself - which is a hash, so it is
 * unpredictable before the table exists and identical for everyone after.
 */
function realtimeSeed(session: GameSession): number {
  const raw = (session.opts as { seed?: unknown }).seed;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.floor(Math.abs(raw)) % 1_000_000;
  let h = 0;
  for (let i = 0; i < session.id.length; i++) h = (Math.imul(h, 31) + session.id.charCodeAt(i)) >>> 0;
  return h % 1_000_000;
}
