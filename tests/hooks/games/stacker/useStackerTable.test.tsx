import '@tests/support/game-engines';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStackerTable, type StackerTableInput } from '@/hooks/games/stacker/useStackerTable';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { applyMatchEvent } from '@/lib/games/stacker/match';
import { acquireRun, clearRuns } from '@/lib/games/stacker/run-registry';

const CH = 'channel-1';
const A = 'pk-ana';
const B = 'pk-bruno';
const GAME_ID = 's'.repeat(64);

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  return parseGameEvent(ev)!;
}

function match(): GameSession {
  return deriveSession([
    parsed(GAME_ID, A, 1000, buildCreate(CH, { game: 'stacker', opts: { seed: 77 }, turnTimeoutS: 0 })),
    parsed('j1', B, 1001, buildGameOp(CH, GAME_ID, 'join')),
    parsed('s1', A, 1002, buildGameOp(CH, GAME_ID, 'start', {
      seats: [{ id: A, by: A, label: 'Ana' }, { id: B, by: B, label: 'Bruno' }],
    })),
  ], 1100)!;
}

function input(session: GameSession, overrides: Partial<StackerTableInput> = {}): StackerTableInput {
  return {
    session,
    match: session.match!,
    mySeats: [A],
    onAttack: vi.fn(),
    onCheckpoint: vi.fn(),
    onTopOut: vi.fn(),
    ...overrides,
  };
}

afterEach(() => clearRuns());

describe('useStackerTable', () => {
  it('plays my seat and shows the other one', () => {
    const session = match();
    const { result } = renderHook(() => useStackerTable(input(session)));
    expect(result.current.iAmAlive).toBe(true);
    expect(result.current.dimmed).toBe(false);
    expect(result.current.showDead).toBe(false);
    expect(result.current.hasOpponents).toBe(true);
    expect(result.current.opponents.map((o) => o.seat)).toEqual([B]);
    expect(result.current.meterPercent).toBe(0);
    expect(result.current.banner).toBeNull();
    expect(result.current.bannerColor).toBeUndefined();
  });

  it('routes the run\'s attacks, checkpoints and top-out through my seat', () => {
    const session = match();
    const props = input(session);
    renderHook(() => useStackerTable(props));
    const run = acquireRun(`${session.id}:${A}`, session.match!.seed);
    run.cb.onAttack(2, 3, 9);
    expect(props.onAttack).toHaveBeenCalledWith(A, B, 2, 3, 9);
    const payload = { frame: 1, attacksSent: 0, linesCleared: 0, stackHeight: 0, board: '' };
    run.cb.onCheckpoint(payload);
    expect(props.onCheckpoint).toHaveBeenCalledWith(A, payload);
    run.cb.onTopOut();
    expect(props.onTopOut).toHaveBeenCalledWith(A);
  });

  it('sends no garbage when nobody else is standing', () => {
    const session = match();
    const props = input(session, { match: applyMatchEvent(session.match!, { op: 'topout', seat: B, at: 1010 }) });
    renderHook(() => useStackerTable(props));
    acquireRun(`${session.id}:${A}`, session.match!.seed).cb.onAttack(2, 3, 9);
    expect(props.onAttack).not.toHaveBeenCalled();
  });

  it('dims and veils a spectator, who publishes nothing', () => {
    const session = match();
    const props = input(session, { mySeats: [] });
    const { result } = renderHook(() => useStackerTable(props));
    expect(result.current.dimmed).toBe(true);
    expect(result.current.showDead).toBe(true);
    expect(result.current.opponents.map((o) => o.seat)).toEqual([A, B]);
    const run = acquireRun(`${session.id}:spectator`, session.match!.seed);
    run.cb.onAttack(1, 1, 1);
    run.cb.onTopOut();
    expect(props.onAttack).not.toHaveBeenCalled();
    expect(props.onTopOut).not.toHaveBeenCalled();
  });

  it('opens the key panel and closes it', () => {
    const { result } = renderHook(() => useStackerTable(input(match())));
    act(() => result.current.openKeys());
    expect(result.current.keysOpen).toBe(true);
    act(() => result.current.closeKeys());
    expect(result.current.keysOpen).toBe(false);
  });

  it('sizes the mini wells from the playfield cell', () => {
    const { result } = renderHook(() => useStackerTable(input(match())));
    expect(result.current.miniCell).toBe(Math.max(4, Math.round(result.current.cell / 4)));
  });
});
