import '@tests/support/game-engines';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY as ME } from '@tests/support/mocks/nostr-bridge';

const transport = vi.hoisted(() => ({
  publishStart: vi.fn(), publishAttack: vi.fn(), publishCheckpoint: vi.fn(), publishTopOut: vi.fn(),
  publishMove: vi.fn(), publishTimeout: vi.fn(), subscribeChannelGames: vi.fn(),
}));
vi.mock('@/services/games/transport', () => transport);
vi.mock('@/services/games/resolve', () => ({ requestGameLoad: vi.fn() }));
vi.mock('@/services/games/cache', () => ({ seedGameFromCache: vi.fn() }));

import { useGameTableModal } from '@/hooks/games/table/useGameTableModal';
import { DIALOG_BOARD_WIDTH } from '@/constants/games/table';
import { useGamesStore } from '@/store/games';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';

const CH = 'channel-1';
const ID = 'a'.repeat(64);
const B = 'b'.repeat(64);
const now = Math.floor(Date.now() / 1000);

function parsed(id: string, pubkey: string, at: number, t: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, kind: t.kind, tags: t.tags, content: t.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

const mount = () => renderHook(() => useGameTableModal(ID), { wrapper: bridgeWrapper(fakeBridge()) });

beforeEach(() => {
  useGamesStore.getState().reset();
  for (const fn of Object.values(transport)) fn.mockReset().mockResolvedValue(undefined);
  useGamesStore.getState().ingestMany([
    parsed(ID, ME, now - 10, buildCreate(CH, { game: 'chain-reaction', turnTimeoutS: 0 })),
    parsed('j1', B, now - 9, buildGameOp(CH, ID, 'join')),
  ]);
});

describe('useGameTableModal', () => {
  it('reads the open table and opens as a dialog on a desktop-width window', () => {
    const { result } = mount();
    expect(result.current.session?.id).toBe(ID);
    expect(result.current.myPubkey).toBe(ME);
    expect(result.current.mySeats).toEqual([]);
    expect(result.current.fullscreen).toBe(false);
    expect(result.current.boardMaxWidth).toBe(DIALOG_BOARD_WIDTH);
    expect(result.current.boardMaxHeight).toBeUndefined();
  });

  it('toggles fullscreen', () => {
    const { result } = mount();
    act(() => result.current.toggleFullscreen());
    expect(result.current.fullscreen).toBe(true);
    act(() => result.current.toggleFullscreen());
    expect(result.current.fullscreen).toBe(false);
  });

  it('closes the seat picker and publishes the seats when the host starts', async () => {
    const { result } = mount();
    act(() => result.current.openSeatPicker());
    expect(result.current.seatPickerOpen).toBe(true);
    const seats = [{ id: ME, by: ME }, { id: B, by: B }];
    await act(async () => { result.current.startWithSeats(seats); });
    expect(result.current.seatPickerOpen).toBe(false);
    expect(transport.publishStart).toHaveBeenCalledWith(CH, ID, seats);
  });

  it('closes the seat picker without publishing', () => {
    const { result } = mount();
    act(() => result.current.openSeatPicker());
    act(() => result.current.closeSeatPicker());
    expect(result.current.seatPickerOpen).toBe(false);
    expect(transport.publishStart).not.toHaveBeenCalled();
  });

  it('sends the Stacker board\'s events for this table', () => {
    const { result } = mount();
    const checkpoint = { frame: 1, attacksSent: 0, linesCleared: 0, stackHeight: 0, board: '' };
    result.current.onStackerAttack('s1', 's2', 2, 4, 9);
    result.current.onStackerCheckpoint('s1', checkpoint);
    result.current.onStackerTopOut('s1');
    expect(transport.publishAttack).toHaveBeenCalledWith(CH, ID, { seat: 's1', target: 's2', lines: 2, hole: 4, nonce: 9 });
    expect(transport.publishCheckpoint).toHaveBeenCalledWith(CH, ID, { seat: 's1', ...checkpoint });
    expect(transport.publishTopOut).toHaveBeenCalledWith(CH, ID, 's1');
  });

  it('has nothing to show for a table it has not loaded', () => {
    useGamesStore.getState().reset();
    const { result } = mount();
    expect(result.current.session).toBeFalsy();
    expect(result.current.mySeats).toEqual([]);
    expect(result.current.secondsLeft).toBeNull();
  });
});
