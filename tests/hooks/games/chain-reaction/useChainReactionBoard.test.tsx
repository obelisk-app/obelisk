import '@tests/support/game-engines';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';
import { useChainReactionBoard } from '@/hooks/games/chain-reaction/useChainReactionBoard';

const CH = 'channel-1';
const A = 'pk-ana';
const B = 'pk-bruno';
const ID = 'a'.repeat(64);

function parsed(id: string, pubkey: string, at: number, t: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, kind: t.kind, tags: t.tags, content: t.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

/** A started small board (5×7), with Ana's first orb on cell 0 when asked. */
function table(withMove = false): GameSession {
  return deriveSession([
    parsed(ID, A, 1000, buildCreate(CH, { game: 'chain-reaction', opts: { size: 'small' }, turnTimeoutS: 0 })),
    parsed('j1', B, 1001, buildGameOp(CH, ID, 'join')),
    parsed('s1', A, 1002, buildGameOp(CH, ID, 'start', { seats: [A, B] })),
    ...(withMove ? [parsed('m0', A, 1003, buildGameOp(CH, ID, 'move', { n: 0, seat: A, action: { cell: 0 } }))] : []),
  ], 1100)!;
}

function mount(game: GameSession, mySeats: string[], onAction = vi.fn().mockResolvedValue(undefined)) {
  const { result } = renderHook(() => useChainReactionBoard({ game, mySeats, onAction, maxWidth: 420, seatLabel: (s) => s.toUpperCase() }));
  return { result, onAction };
}

describe('useChainReactionBoard', () => {
  it('sizes the board and lists the seats under it', () => {
    const { result } = mount(table(), [A]);
    expect(result.current).toMatchObject({ cols: 5, boardWidth: 220, matrixHex: SEAT_COLORS[0].hex, myColor: SEAT_COLORS[0] });
    expect(result.current.cells).toHaveLength(35);
    expect(result.current.legend.map((e) => [e.label, e.isMe, e.turn])).toEqual([['PK-ANA', true, true], ['PK-BRUNO', false, false]]);
  });

  it('plays a cell for the seat on move', async () => {
    const { result, onAction } = mount(table(), [A]);
    expect(result.current.cells[3].canClick).toBe(true);
    await act(() => result.current.click(3));
    expect(onAction).toHaveBeenCalledWith({ cell: 3 }, A);
  });

  it('refuses a cell an opponent owns, and every cell when it is not your move', async () => {
    const mine = mount(table(true), [B]);
    expect(mine.result.current.cells[0].canClick).toBe(false);
    await act(() => mine.result.current.click(0));
    expect(mine.onAction).not.toHaveBeenCalled();

    const notMine = mount(table(), [B]);
    await act(() => notMine.result.current.click(3));
    expect(notMine.onAction).not.toHaveBeenCalled();
  });

  it('holds the board while a move is in flight', async () => {
    let release: () => void = () => {};
    const onAction = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const { result } = mount(table(), [A], onAction);
    let first: Promise<void> = Promise.resolve();
    act(() => { first = result.current.click(3); });
    expect(result.current.cells.some((c) => c.canClick)).toBe(false);
    await act(() => result.current.click(4));
    expect(onAction).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await first; });
    expect(result.current.cells[4].canClick).toBe(true);
  });
});
