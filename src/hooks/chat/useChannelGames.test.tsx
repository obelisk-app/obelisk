import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { GameSession } from '@/lib/games/session';

const publishTimeout = vi.fn().mockResolvedValue(undefined);
let connectionState = 'Connected';

vi.mock('@/lib/games/transport', () => ({
  subscribeChannelGames: vi.fn().mockResolvedValue(() => {}),
  publishTimeout: (...args: unknown[]) => publishTimeout(...args),
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useConnectionState: () => connectionState,
}));

// Counts replays so the "one event must not re-derive every table" guarantee is
// observable rather than inferred from timings.
const { replaySpy } = vi.hoisted(() => ({ replaySpy: vi.fn() }));
vi.mock('@/lib/games/session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/games/session')>();
  return {
    ...actual,
    replayLog: (events: Parameters<typeof actual.replayLog>[0]) => {
      replaySpy();
      return actual.replayLog(events);
    },
  };
});

const {
  useTurnClockEnforcer,
  useGameSession,
  SESSION_CLOCK_MS,
  RECONNECT_CLAIM_GRACE_S,
  TIMEOUT_CLAIM_GRACE_S,
} = await import('./useChannelGames');
const { useGamesStore } = await import('@/store/games');
const { __resetGameClocks } = await import('@/lib/games/clock');
const { parseGameEvent, buildCreate, buildGameOp } = await import('@/lib/games/protocol');
const { chainReaction } = await import('@/lib/games/chain-reaction');

const T0 = 1_760_000_000;

/** A two-seat table, in progress, whose clock ran out `expiredFor` seconds ago. */
function table(expiredFor: number): GameSession {
  return tableWithDeadline(T0 - expiredFor);
}

/** The same table, with the deadline stated outright. */
function tableWithDeadline(deadline: number): GameSession {
  return {
    id: 'table-1',
    channelId: 'channel-1',
    game: 'chain-reaction',
    status: 'in_progress',
    createdBy: 'pk-ana',
    createdAt: T0 - 100,
    opts: {},
    turnTimeoutS: 45,
    minPlayers: 2,
    maxPlayers: 8,
    participants: ['seat-ana', 'seat-bruno'],
    seats: [
      { id: 'seat-ana', by: 'pk-ana', label: 'Ana' },
      { id: 'seat-bruno', by: 'pk-bruno', label: 'Bruno' },
    ],
    joined: ['pk-ana', 'pk-bruno'],
    state: {},
    // Bruno is on move; the tests run as Ana, who is the one who may claim.
    currentTurn: 'seat-bruno',
    turnIndex: 4,
    turnStartedAt: deadline - 45,
    turnDeadline: deadline,
    winner: null,
    draw: false,
    eliminated: [],
    finishedAt: null,
    match: null,
  } as unknown as GameSession;
}

/** Let the one-second tick fire, so the effect re-evaluates against `now`. */
function tick(seconds = 1) {
  act(() => {
    vi.advanceTimersByTime(seconds * 1000);
  });
}

describe('useTurnClockEnforcer', () => {
  beforeEach(() => {
    publishTimeout.mockClear();
    connectionState = 'Connected';
    vi.useFakeTimers();
    vi.setSystemTime(T0 * 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims the turn once the clock has run out on somebody else', () => {
    renderHook(() => useTurnClockEnforcer(table(TIMEOUT_CLAIM_GRACE_S + 1), 'pk-ana', true));
    // The connection has to be old enough to be trusted — see the reconnect test.
    tick(RECONNECT_CLAIM_GRACE_S + 1);
    expect(publishTimeout).toHaveBeenCalledWith('channel-1', 'table-1', 4);
  });

  it('claims a turn exactly once, however long it keeps ticking', () => {
    renderHook(() => useTurnClockEnforcer(table(TIMEOUT_CLAIM_GRACE_S + 1), 'pk-ana', true));
    tick(RECONNECT_CLAIM_GRACE_S + 30);
    expect(publishTimeout).toHaveBeenCalledTimes(1);
  });

  it('waits out the grace period, so a move already in flight can land', () => {
    // Start on a live turn, and let the connection age past the reconnect
    // grace so this test is only about the deadline.
    const { rerender } = renderHook(
      ({ session }: { session: GameSession }) => useTurnClockEnforcer(session, 'pk-ana', true),
      { initialProps: { session: tableWithDeadline(T0 + 60) } },
    );
    tick(RECONNECT_CLAIM_GRACE_S + 1);
    expect(publishTimeout).not.toHaveBeenCalled();

    // The deadline passes this second: inside the grace, nobody is reported.
    const deadline = Math.floor(Date.now() / 1000);
    rerender({ session: tableWithDeadline(deadline) });
    tick(TIMEOUT_CLAIM_GRACE_S - 1);
    expect(publishTimeout).not.toHaveBeenCalled();

    tick(2);
    expect(publishTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not claim on a connection that only just came back', () => {
    // The relay was down; the deadline passed while nobody could publish.
    connectionState = 'Disconnected';
    const { rerender } = renderHook(
      ({ conn }: { conn: string }) => {
        connectionState = conn;
        return useTurnClockEnforcer(table(120), 'pk-ana', true);
      },
      { initialProps: { conn: 'Disconnected' } },
    );
    tick(5);
    expect(publishTimeout).not.toHaveBeenCalled();

    rerender({ conn: 'Connected' });
    tick(RECONNECT_CLAIM_GRACE_S - 2);
    expect(publishTimeout).not.toHaveBeenCalled();

    // …and only once the player on move has had a fair window on a live relay.
    tick(3);
    expect(publishTimeout).toHaveBeenCalledTimes(1);
  });

  it('never reports its own seat for running out the clock', () => {
    const session = table(TIMEOUT_CLAIM_GRACE_S + 1);
    renderHook(() => useTurnClockEnforcer(session, 'pk-bruno', true));
    tick(RECONNECT_CLAIM_GRACE_S + 5);
    expect(publishTimeout).not.toHaveBeenCalled();
  });

  it('stays quiet for a spectator who holds no seat', () => {
    renderHook(() => useTurnClockEnforcer(table(TIMEOUT_CLAIM_GRACE_S + 1), 'pk-nobody', true));
    tick(RECONNECT_CLAIM_GRACE_S + 5);
    expect(publishTimeout).not.toHaveBeenCalled();
  });

  it('stays quiet on a table that is not running', () => {
    const finished = { ...table(600), status: 'finished' as const };
    renderHook(() => useTurnClockEnforcer(finished, 'pk-ana', true));
    tick(RECONNECT_CLAIM_GRACE_S + 5);
    expect(publishTimeout).not.toHaveBeenCalled();
  });

  it('stays quiet on a table with no clock', () => {
    const noClock = { ...table(600), turnDeadline: null, turnTimeoutS: 0 };
    renderHook(() => useTurnClockEnforcer(noClock, 'pk-ana', true));
    tick(RECONNECT_CLAIM_GRACE_S + 5);
    expect(publishTimeout).not.toHaveBeenCalled();
  });
});

describe('useGameSession', () => {
  const CH = 'channel-1';
  const HOST = 'pk-host';

  function parsed(id: string, pubkey: string, at: number, template: { kind: number; content: string; tags: string[][] }) {
    const p = parseGameEvent({ id, pubkey, created_at: at, kind: template.kind, tags: template.tags, content: template.content });
    if (!p) throw new Error('unparseable');
    return p;
  }

  const create = (id: string) => parsed(id, HOST, T0 - 10, buildCreate(CH, { game: chainReaction.type, turnTimeoutS: 45 }));
  const join = (id: string, gameId: string) => parsed(id, `pk-${id}`, T0 - 9, buildGameOp(CH, gameId, 'join'));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 * 1000);
    __resetGameClocks();
    useGamesStore.getState().reset();
    replaySpy.mockClear();
  });

  afterEach(() => {
    __resetGameClocks();
    vi.useRealTimers();
  });

  it('replays only the table that changed', () => {
    useGamesStore.getState().ingestMany([create('g1'), create('g2')]);
    const a = renderHook(() => useGameSession('g1'));
    const b = renderHook(() => useGameSession('g2'));
    const bBefore = b.result.current;
    replaySpy.mockClear();

    act(() => { useGamesStore.getState().ingest(join('j1', 'g1')); });

    // One table grew, so one table is replayed — the other card is untouched,
    // and hands back the very same session object it had before.
    expect(replaySpy).toHaveBeenCalledTimes(1);
    expect(b.result.current).toBe(bBefore);
    expect(a.result.current!.joined).toHaveLength(2);
  });

  it('does not replay on a clock tick', () => {
    useGamesStore.getState().ingestMany([create('g1'), join('j1', 'g1')]);
    const { result } = renderHook(() => useGameSession('g1'));
    const before = result.current;
    replaySpy.mockClear();

    act(() => { vi.advanceTimersByTime(SESSION_CLOCK_MS * 3); });

    expect(replaySpy).not.toHaveBeenCalled();
    expect(result.current).toBe(before);
  });

  it('is null for a table whose create has not arrived', () => {
    const { result } = renderHook(() => useGameSession('nope'));
    expect(result.current).toBeNull();
  });
});
