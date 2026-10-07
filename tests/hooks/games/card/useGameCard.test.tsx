import '@tests/support/game-engines';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';

const requestGameLoad = vi.hoisted(() => vi.fn());
vi.mock('@/services/games/resolve', () => ({ requestGameLoad }));
const seedGameFromCache = vi.hoisted(() => vi.fn());
vi.mock('@/services/games/cache', () => ({ seedGameFromCache }));

import { useGameCard } from '@/hooks/games/card/useGameCard';
import { RESOLVE_GRACE_MS } from '@/constants/games/card';
import { useGamesStore } from '@/store/games';
import { buildCreate, buildGameOp, parseGameEvent, type GameEvent, type ParsedGameEvent } from '@/lib/games/protocol/protocol';
import { SEAT_COLORS } from '@/constants/games/chain-reaction';

const CH = 'channel-1';
const ID = 'a'.repeat(64);

function parsed(id: string, pubkey: string, at: number, t: { kind: number; content: string; tags: string[][] }): ParsedGameEvent {
  const p = parseGameEvent({ id, pubkey, created_at: at, kind: t.kind, tags: t.tags, content: t.content } as GameEvent);
  if (!p) throw new Error('unparseable');
  return p;
}

const now = Math.floor(Date.now() / 1000);
const openTable = () => [
  parsed(ID, 'pk-host', now - 10, buildCreate(CH, { game: 'chain-reaction', turnTimeoutS: 45 })),
  parsed('j1', 'pk-b', now - 9, buildGameOp(CH, ID, 'join')),
];

const mount = () => renderHook(() => useGameCard(ID), { wrapper: bridgeWrapper(fakeBridge()) });

beforeEach(() => {
  useGamesStore.getState().reset();
  requestGameLoad.mockClear();
  seedGameFromCache.mockClear();
});

describe('useGameCard', () => {
  it('reads the table from the store, with one dot per joined account', () => {
    useGamesStore.getState().ingestMany(openTable());
    const { result } = mount();
    expect(result.current.session?.id).toBe(ID);
    expect(result.current.dots).toEqual([
      { pubkey: 'pk-host', hex: SEAT_COLORS[0].hex },
      { pubkey: 'pk-b', hex: SEAT_COLORS[1].hex },
    ]);
    expect(seedGameFromCache).not.toHaveBeenCalled();
  });

  it('opens its table', () => {
    useGamesStore.getState().ingestMany(openTable());
    const { result } = mount();
    act(() => result.current.open());
    expect(useGamesStore.getState().openGameId).toBe(ID);
  });

  describe('with no table yet', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    it('seeds from the cache at once and asks the relay after the grace period', () => {
      const { result } = mount();
      expect(result.current.session).toBeFalsy();
      expect(result.current.dots).toEqual([]);
      expect(seedGameFromCache).toHaveBeenCalledWith(ID);
      act(() => { vi.advanceTimersByTime(RESOLVE_GRACE_MS - 1); });
      expect(requestGameLoad).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1); });
      expect(requestGameLoad).toHaveBeenCalledWith(ID);
    });

    it('does not ask once the log arrives inside the grace period', () => {
      mount();
      act(() => { useGamesStore.getState().ingestMany(openTable()); });
      act(() => { vi.advanceTimersByTime(RESOLVE_GRACE_MS * 5); });
      expect(requestGameLoad).not.toHaveBeenCalled();
    });
  });
});
