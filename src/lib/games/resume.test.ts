import { describe, it, expect } from 'vitest';
import { deriveSession, isTurnExpired, type GameSession } from './session';
import {
  buildCreate,
  buildGameOp,
  parseGameEvent,
  type GameEvent,
  type ParsedGameEvent,
} from './protocol';
import { chainReaction } from './chain-reaction';
import type { CRState } from './chain-reaction';

/**
 * Picking a match back up.
 *
 * A relay restart, a dropped socket, a reload, a spectator arriving late: all
 * of them are the same thing to this code — a client with an empty store
 * receiving the log again, possibly out of order, possibly twice. What it
 * derives has to be the match everybody else is already looking at, with the
 * same seat on move and the same clock.
 *
 * These are the assertions behind "the game continues where it left off".
 */

const CH = 'channel-1';
const HOST = 'pk-ana';
const B = 'pk-bruno';
const GAME_ID = 'table-1';
const T0 = 1_760_000_000;
const TIMEOUT_S = 45;

let seq = 0;
function ev(
  pubkey: string,
  createdAt: number,
  template: { kind: number; content: string; tags: string[][] },
  id?: string,
): ParsedGameEvent {
  const parsed = parseGameEvent({
    id: id ?? `id-${String(seq++).padStart(4, '0')}`,
    pubkey,
    created_at: createdAt,
    kind: template.kind,
    tags: template.tags,
    content: template.content,
  } as GameEvent);
  if (!parsed) throw new Error('unparseable fixture event');
  return parsed;
}

/** A started two-player table, plus a few moves — a match in progress. */
function matchInProgress(): { log: ParsedGameEvent[]; at: number } {
  const log: ParsedGameEvent[] = [
    ev(HOST, T0, buildCreate(CH, { game: chainReaction.type, opts: { size: 'small' }, turnTimeoutS: TIMEOUT_S }), GAME_ID),
    ev(B, T0 + 1, buildGameOp(CH, GAME_ID, 'join')),
    ev(HOST, T0 + 2, buildGameOp(CH, GAME_ID, 'start', { seats: [HOST, B] })),
  ];
  const cells = [0, 6, 1, 7, 2];
  cells.forEach((cell, i) => {
    const mover = i % 2 === 0 ? HOST : B;
    log.push(ev(mover, T0 + 3 + i, buildGameOp(CH, GAME_ID, 'move', { n: i, action: { cell }, seat: mover })));
  });
  return { log, at: T0 + 3 + cells.length };
}

function derive(log: readonly ParsedGameEvent[], now: number): GameSession {
  const s = deriveSession(log, now);
  if (!s) throw new Error('no session derived');
  return s;
}

describe('resuming a table from the relay', () => {
  it('a client that reloads mid-match derives exactly the live board', () => {
    const { log, at } = matchInProgress();
    const live = derive(log, at);
    // The reload case: same events, arbitrary order, empty store.
    const reloaded = derive([...log].reverse(), at);

    expect(reloaded.state).toEqual(live.state);
    expect(reloaded.currentTurn).toBe(live.currentTurn);
    expect(reloaded.turnIndex).toBe(live.turnIndex);
    expect(reloaded.turnDeadline).toBe(live.turnDeadline);
    expect(reloaded.status).toBe('in_progress');
  });

  it('backfill after a reconnect is idempotent — duplicates change nothing', () => {
    const { log, at } = matchInProgress();
    const once = derive(log, at);
    // A reconnect re-REQs the window, so every event arrives a second time.
    const twice = derive([...log, ...log], at);

    expect(twice.state).toEqual(once.state);
    expect(twice.turnIndex).toBe(once.turnIndex);
    expect(twice.currentTurn).toBe(once.currentTurn);
  });

  it('keeps the clock anchored to the log, not to when the client showed up', () => {
    const { log, at } = matchInProgress();
    const session = derive(log, at);
    // The deadline is a property of the last accepted move, so a client that
    // arrives an hour later sees the same one — and sees it as expired.
    expect(session.turnDeadline).toBe(at - 1 + TIMEOUT_S);
    expect(isTurnExpired(session, at)).toBe(false);
    const late = derive(log, at + 3600);
    expect(late.turnDeadline).toBe(session.turnDeadline);
    expect(isTurnExpired(late, at + 3600)).toBe(true);
  });

  it('a move published against a stale turn index is dropped, not applied', () => {
    const { log, at } = matchInProgress();
    const live = derive(log, at);
    const staleN = live.turnIndex - 2;
    const mover = live.currentTurn!;

    const withStale = derive(
      [...log, ev(mover, at + 1, buildGameOp(CH, GAME_ID, 'move', { n: staleN, action: { cell: 20 }, seat: mover }))],
      at + 1,
    );
    expect(withStale.turnIndex).toBe(live.turnIndex);
    expect(withStale.state).toEqual(live.state);
  });

  it('a move signed by the wrong account is dropped', () => {
    const { log, at } = matchInProgress();
    const live = derive(log, at);
    const impostor = live.currentTurn === HOST ? B : HOST;

    const forged = derive(
      [...log, ev(impostor, at + 1, buildGameOp(CH, GAME_ID, 'move', { n: live.turnIndex, action: { cell: 20 }, seat: live.currentTurn }))],
      at + 1,
    );
    expect(forged.turnIndex).toBe(live.turnIndex);
    expect(forged.currentTurn).toBe(live.currentTurn);
    expect(forged.state).toEqual(live.state);
  });

  it('a timeout claimed before the deadline is refused — the turn is still theirs', () => {
    const { log, at } = matchInProgress();
    const live = derive(log, at);
    const claimant = live.currentTurn === HOST ? B : HOST;

    const early = derive(
      [...log, ev(claimant, live.turnDeadline! - 1, buildGameOp(CH, GAME_ID, 'timeout', { n: live.turnIndex }))],
      live.turnDeadline!,
    );
    expect(early.currentTurn).toBe(live.currentTurn);
    expect(early.turnIndex).toBe(live.turnIndex);
  });

  it('a timeout claimed after the deadline is applied once, however many arrive', () => {
    const { log, at } = matchInProgress();
    const live = derive(log, at);
    const claimant = live.currentTurn === HOST ? B : HOST;
    const deadline = live.turnDeadline!;

    const claims = [
      ev(claimant, deadline, buildGameOp(CH, GAME_ID, 'timeout', { n: live.turnIndex })),
      // Every client at the table races to publish; the rest are duplicates.
      ev(HOST, deadline + 1, buildGameOp(CH, GAME_ID, 'timeout', { n: live.turnIndex })),
      ev(B, deadline + 1, buildGameOp(CH, GAME_ID, 'timeout', { n: live.turnIndex })),
    ];
    const after = derive([...log, ...claims], deadline + 2);

    // Chain Reaction eliminates a seat that blows the clock, so on a
    // two-player table the match ends there. What matters is that three
    // racing claims did the work of exactly one.
    expect(after.status).toBe('finished');
    expect(after.eliminated).toEqual([live.currentTurn]);
    expect(after.winner).toBe(claimant);

    // Anything published after the table finished is inert.
    const later = derive(
      [...log, ...claims, ev(claimant, deadline + 5, buildGameOp(CH, GAME_ID, 'timeout', { n: live.turnIndex + 1 }))],
      deadline + 6,
    );
    expect(later.status).toBe('finished');
    expect(later.winner).toBe(after.winner);
    expect(later.state).toEqual(after.state);
  });

  it('the board a spectator replays is the board the players are playing', () => {
    const { log, at } = matchInProgress();
    const players = derive(log, at);
    // A spectator has no seat and no history — only the relay's copy.
    const spectator = derive([...log].sort((a, b) => a.id.localeCompare(b.id)), at);

    const a = players.state as CRState;
    const b = spectator.state as CRState;
    expect(b.cells).toEqual(a.cells);
    expect(b.order).toEqual(a.order);
    expect(spectator.currentTurn).toBe(players.currentTurn);
  });
});
