import '@tests/support/game-engines';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useHarness } from '@/hooks/games/shots/useHarness';

describe('useHarness', () => {
  it('builds every fixture once and keeps it across renders', () => {
    const { result, rerender } = renderHook(() => useHarness());
    const first = result.current;
    expect(first.cr.game).toBe('chain-reaction');
    expect(first.crDone.status).toBe('finished');
    expect(first.vesta.game).toBe('vesta');
    expect(first.stacker.match).toBeTruthy();
    rerender();
    expect(result.current.cr).toBe(first.cr);
    expect(result.current.still).toBe(first.still);
  });

  it('plays each board as the seat on move', () => {
    const { result } = renderHook(() => useHarness());
    expect(result.current.crSeats).toEqual([result.current.cr.currentTurn ?? 'seat-ana']);
    expect(result.current.vestaSeats).toEqual([result.current.vesta.currentTurn ?? 'seat-ana']);
  });

  it('hands the Stacker board a still frame and the boards a no-op action', async () => {
    const { result } = renderHook(() => useHarness());
    const listener = vi.fn();
    result.current.still.onFrame(listener);
    expect(listener).toHaveBeenCalledWith(result.current.still.state);
    await expect(result.current.noop()).resolves.toBeUndefined();
  });
});
