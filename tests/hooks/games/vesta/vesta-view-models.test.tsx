import '@tests/support/game-engines';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { CANVAS_HEIGHT, CANVAS_WIDTH, getValidPositions, type GameState } from 'vesta';
import { deriveSession, type GameSession } from '@/lib/games/session/session';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { vertexAt } from '@/lib/games/vesta/geometry';
import { useVestaTurn } from '@/hooks/games/vesta/useVestaTurn';
import { useVestaTable } from '@/hooks/games/vesta/useVestaTable';
import { useVestaBoard } from '@/hooks/games/vesta/useVestaBoard';
import { useVestaPlayers } from '@/hooks/games/vesta/useVestaPlayers';
import { useVestaPrompts } from '@/hooks/games/vesta/useVestaPrompts';
import { useVestaTradePanel } from '@/hooks/games/vesta/useVestaTradePanel';
import { useVestaTurnActions } from '@/hooks/games/vesta/useVestaTurnActions';
import { useResourceCounter } from '@/hooks/games/vesta/useResourceCounter';
import { LocaleProvider } from '@tests/support/intl';

const CH = 'channel-1';
const HOST = 'pk-host';
const B = 'pk-b';
const GAME_ID = 'v'.repeat(64);

function parsed(id: string, pubkey: string, createdAt: number, template: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const ev: GameEvent = { id, pubkey, created_at: createdAt, kind: template.kind, tags: template.tags, content: template.content };
  return parseGameEvent(ev)!;
}

const session: GameSession = deriveSession([
  parsed(GAME_ID, HOST, 1000, buildCreate(CH, { game: 'vesta', opts: { seed: 42 }, turnTimeoutS: 0 })),
  parsed('j1', B, 1001, buildGameOp(CH, GAME_ID, 'join')),
  parsed('s1', HOST, 1002, buildGameOp(CH, GAME_ID, 'start', {
    seats: [{ id: HOST, by: HOST, label: 'Ana' }, { id: B, by: B, label: 'Bruno' }],
  })),
], 1100)!;

const setup = session.state as GameState;
const playing: GameState = {
  ...setup,
  phase: 'play' as const,
  rolled: true,
  dice: [1, 2] as [number, number],
  players: setup.players.map((p) => ({ ...p, resources: { ...p.resources, brick: 4, lumber: 1, wool: 1, grain: 1, ore: 1 } })),
};

const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

/** A turn for `state` seen from `seats`, plus a panel hook reading it, as the table composes them. */
function withTurn<T>(state: GameState, seats: string[], panel: (turn: ReturnType<typeof useVestaTurn>) => T) {
  const onAction = vi.fn().mockResolvedValue(undefined);
  const hook = renderHook(() => {
    const turn = useVestaTurn({ session, state, mySeats: seats, onAction });
    return { turn, panel: panel(turn) };
  }, { wrapper });
  return { ...hook, onAction };
}

describe('useVestaTable', () => {
  it('turns board picks into moves for the acting seat and says who it waits for', async () => {
    const onAction = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useVestaTable({ session, state: setup, mySeats: [HOST], onAction }));
    expect(result.current.waiting).toBe(false);
    act(() => result.current.pickVertex({ q: 0, r: 0, corner: 1 }));
    act(() => result.current.pickEdge({ q1: 0, r1: 0, corner1: 1, q2: 0, r2: 0, corner2: 2 }));
    act(() => result.current.pickHex({ q: 1, r: 0 }));
    expect(onAction.mock.calls.map(([a, seat]) => [a.type, seat])).toEqual([
      ['place-settlement', HOST], ['place-road', HOST], ['move-robber', HOST],
    ]);

    const other = renderHook(() => useVestaTable({ session, state: setup, mySeats: [B], onAction }));
    expect(other.result.current.waiting).toBe(true);
    expect(other.result.current.waitingFor).toBe(HOST);
  });
});

describe('useVestaBoard', () => {
  const rect = { left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => ({}) };
  const click = (x: number, y: number) => ({ clientX: x, clientY: y }) as never;

  it('is pickable only while the board asks for something', () => {
    expect(renderHook(() => useVestaBoard({ state: setup, mode: 'none' })).result.current.pickable).toBe(false);
    expect(renderHook(() => useVestaBoard({ state: setup, mode: 'road' })).result.current.pickable).toBe(true);
  });

  it('hands a click on a legal corner to onPickVertex', () => {
    const onPickVertex = vi.fn();
    const { result } = renderHook(() => useVestaBoard({ state: setup, mode: 'initial-settlement', onPickVertex }));
    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () => rect;
    (result.current.canvasRef as { current: HTMLCanvasElement | null }).current = canvas;
    const spot = vertexAt(getValidPositions(setup, 'initial-settlement')[0].key)!;
    result.current.onClick(click(spot.x, spot.y));
    expect(onPickVertex).toHaveBeenCalledWith(spot.hexes[0]);
    result.current.onClick(click(-999, -999));
    expect(onPickVertex).toHaveBeenCalledTimes(1);
  });
});

describe('useVestaPlayers', () => {
  it('builds the tiles and the status line', () => {
    const { result } = withTurn(playing, [HOST], (turn) => useVestaPlayers({ state: playing, mySeats: [HOST], turn }));
    expect(result.current.panel.tiles.map((t) => [t.seat, t.mine, t.onMove])).toEqual([[HOST, true, true], [B, false, false]]);
    expect(result.current.panel.status).toEqual({ kind: 'dice', dice: [1, 2], total: 3 });
  });
});

describe('useVestaPrompts', () => {
  const seven: GameState = {
    ...setup,
    phase: 'play' as const,
    dice: [3, 4] as [number, number],
    players: setup.players.map((p, i) => (i === 1 ? { ...p, resources: { ...p.resources, brick: 6, ore: 4 } } : p)),
  };

  it('drafts a discard of half the hand and sends it', () => {
    const { result, onAction } = withTurn(seven, [B], (turn) => useVestaPrompts({ state: seven, turn }));
    expect(result.current.panel.mustDiscard).toBe(true);
    expect(result.current.panel.discardCount).toBe(5);
    expect(result.current.panel.discardCounters.find((c) => c.resource === 'brick')!.max).toBe(6);
    act(() => result.current.panel.setDiscardCount('brick', 5));
    expect(result.current.panel.discardPicked).toBe(5);
    expect(result.current.panel.canDiscard).toBe(true);
    act(() => result.current.panel.submitDiscard());
    expect(onAction).toHaveBeenCalledWith({ type: 'discard-resources', resources: { brick: 5, lumber: 0, wool: 0, grain: 0, ore: 0 } }, B);
    expect(result.current.panel.discardPicked).toBe(0);
  });

  it('will not discard while busy', () => {
    const { result } = withTurn(seven, [B], (turn) => useVestaPrompts({ state: seven, busy: true, turn }));
    act(() => result.current.panel.setDiscardCount('brick', 5));
    expect(result.current.panel.canDiscard).toBe(false);
  });

  it('describes an offer to its target and answers it', () => {
    const offered = { ...setup, pendingTrade: { from: 0, to: 1, give: { brick: 2 }, take: {} } } as unknown as GameState;
    const { result, onAction } = withTurn(offered, [B], (turn) => useVestaPrompts({ state: offered, turn }));
    expect(result.current.panel.offer).toEqual({ fromSeat: HOST, give: '2🧱', take: null });
    act(() => result.current.panel.accept());
    act(() => result.current.panel.reject());
    expect(onAction.mock.calls.map(([a]) => a.type)).toEqual(['accept-trade', 'reject-trade']);
  });

  it('shows no offer to a seat that is neither side of it', () => {
    const offered = { ...setup, pendingTrade: { from: 0, to: 1, give: {}, take: {} } } as unknown as GameState;
    const { result } = withTurn(offered, ['pk-watcher'], (turn) => useVestaPrompts({ state: offered, turn }));
    expect(result.current.panel.offer).toBeNull();
  });
});

describe('useVestaTradePanel', () => {
  it('is hidden until the roll and shows the other seats as partners', () => {
    const before = { ...playing, rolled: false };
    expect(withTurn(before, [HOST], (turn) => useVestaTradePanel({ state: before, turn })).result.current.panel.visible).toBe(false);
    const { result } = withTurn(playing, [HOST], (turn) => useVestaTradePanel({ state: playing, turn }));
    expect(result.current.panel.visible).toBe(true);
    expect(result.current.panel.partners).toEqual([{ seat: B, index: 1 }]);
    expect(result.current.panel.giveMax('brick')).toBe(4);
    expect(result.current.panel.takeMax()).toBe(19);
  });

  it('trades four bricks for an ore at the bank and clears the draft', () => {
    const { result, onAction } = withTurn(playing, [HOST], (turn) => useVestaTradePanel({ state: playing, turn }));
    expect(result.current.panel.canSubmit).toBe(false);
    act(() => result.current.panel.choosePartner('bank'));
    expect(result.current.panel.isBank).toBe(true);
    expect(result.current.panel.bankRates).toBe('🧱4:1  🪵4:1  🐑4:1  🌾4:1  🪨4:1');
    act(() => result.current.panel.setGiveCount('brick', 4));
    act(() => result.current.panel.setTakeCount('ore', 1));
    expect(result.current.panel.canSubmit).toBe(true);
    act(() => result.current.panel.submit());
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'trade', partner: 'bank' }), HOST);
    expect(result.current.panel.give).toEqual({});
    expect(result.current.panel.take).toEqual({});
  });

  describe('when the hand shrinks under an open draft', () => {
    const lumber = (n: number): GameState => ({
      ...playing,
      players: playing.players.map((p, i) => (i === 0 ? { ...p, resources: { ...p.resources, lumber: n } } : p)),
    });
    /** The panel over a state the test swaps, as the table re-renders it after a move. */
    function panelOver(state: GameState) {
      const onAction = vi.fn().mockResolvedValue(undefined);
      const hook = renderHook(({ s }: { s: GameState }) => {
        const turn = useVestaTurn({ session, state: s, mySeats: [HOST], onAction });
        return { turn, panel: useVestaTradePanel({ state: s, turn }) };
      }, { wrapper, initialProps: { s: state } });
      return { ...hook, onAction };
    }
    /** Offer Bruno all three lumber for his ore. */
    function draftThreeLumber() {
      const h = panelOver(lumber(3));
      act(() => h.result.current.panel.choosePartner(1));
      act(() => h.result.current.panel.setGiveCount('lumber', 3));
      act(() => h.result.current.panel.setTakeCount('ore', 1));
      expect(h.result.current.panel.give.lumber).toBe(3);
      expect(h.result.current.panel.canSubmit).toBe(true);
      return h;
    }

    it('lowers the count to the hand with no press, and sends the lowered count', () => {
      const { result, rerender, onAction } = draftThreeLumber();
      rerender({ s: lumber(2) });
      expect(result.current.panel.give.lumber).toBe(2);
      expect(result.current.panel.take.ore).toBe(1);
      expect(result.current.panel.canSubmit).toBe(true);
      act(() => result.current.panel.submit());
      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
        type: 'propose-trade', give: expect.objectContaining({ lumber: 2 }), take: expect.objectContaining({ ore: 1 }),
      }), HOST);
    });

    it('stays lowered when the hand grows back', () => {
      const { result, rerender } = draftThreeLumber();
      rerender({ s: lumber(2) });
      rerender({ s: lumber(3) });
      expect(result.current.panel.give.lumber).toBe(2);
    });

    it('turns the offer off when the hand no longer holds any of it', () => {
      const { result, rerender } = draftThreeLumber();
      rerender({ s: lumber(0) });
      expect(result.current.panel.give.lumber).toBe(0);
      expect(result.current.panel.canSubmit).toBe(false);
    });

    it('applies the same rule to a discard draft', () => {
      const { result, rerender } = panelOver(lumber(3));
      act(() => result.current.turn.setDiscard({ lumber: 3, brick: 1 }));
      rerender({ s: lumber(1) });
      expect(result.current.turn.discard).toEqual({ lumber: 1, brick: 1 });
    });
  });

  it('sends nothing without a partner', () => {
    const { result, onAction } = withTurn(playing, [HOST], (turn) => useVestaTradePanel({ state: playing, turn }));
    act(() => result.current.panel.submit());
    expect(onAction).not.toHaveBeenCalled();
  });
});

describe('useVestaTurnActions', () => {
  it('offers the roll before rolling and toggles the build modes', () => {
    const fresh = { ...playing, rolled: false, dice: null };
    const { result, onAction } = withTurn(fresh, [HOST], (turn) => useVestaTurnActions({ state: fresh, turn }));
    expect(result.current.panel.showActions).toBe(true);
    expect(result.current.panel.canRoll).toBe(true);
    expect(result.current.panel.canEndTurn).toBe(false);
    expect(result.current.panel.canBuild).toBe(false);
    act(() => result.current.panel.togglePick('road'));
    expect(result.current.panel.pick).toBe('road');
    act(() => result.current.panel.togglePick('road'));
    expect(result.current.panel.pick).toBe('none');
    act(() => result.current.panel.roll());
    expect(onAction).toHaveBeenCalledWith({ type: 'roll-dice' }, HOST);
  });

  it('lists the hand with labels, unplayable while busy', () => {
    const holding = {
      ...playing,
      players: playing.players.map((p, i) => (i === 0 ? { ...p, hand: [{ cardType: 'monopoly', available: false }] } : p)),
    } as GameState;
    const { result } = withTurn(holding, [HOST], (turn) => useVestaTurnActions({ state: holding, busy: true, turn }));
    expect(result.current.panel.hand).toEqual([expect.objectContaining({ label: 'Monopoly', emoji: '👑', enabled: false })]);
    expect(result.current.panel.canRoll).toBe(false);
  });
});

describe('useResourceCounter', () => {
  it('steps the count within zero and the cap', () => {
    const onChange = vi.fn();
    const { result, rerender } = renderHook((props: { value: number }) => useResourceCounter({ value: props.value, max: 2, onChange }), {
      initialProps: { value: 0 },
    });
    result.current.decrement();
    result.current.increment();
    rerender({ value: 2 });
    result.current.increment();
    expect(onChange.mock.calls).toEqual([[0], [1], [2]]);
  });
});
