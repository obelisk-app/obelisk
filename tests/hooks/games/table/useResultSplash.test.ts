import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useResultSplash,
} from '@/hooks/games/table/useResultSplash';
import { RESULT_SPLASH_DELAY_MS, RESULT_SPLASH_MAX_WAIT_MS } from '@/constants/games/table';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useResultSplash', () => {
  it('stays hidden while the table is still playing', () => {
    const { result } = renderHook(() => useResultSplash('g1', false, null));
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_DELAY_MS * 10); });
    expect(result.current.showSplash).toBe(false);
  });

  it('shows a beat after the table finishes', () => {
    const { result } = renderHook(() => useResultSplash('g1', true, 100));
    expect(result.current.showSplash).toBe(false);
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_DELAY_MS); });
    expect(result.current.showSplash).toBe(true);
  });

  it('waits for the board to finish its cascade, up to a ceiling', () => {
    const { result } = renderHook(() => useResultSplash('g1', true, 100));
    act(() => result.current.setBoardRevealing(true));
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_DELAY_MS); });
    expect(result.current.showSplash).toBe(false);
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_MAX_WAIT_MS); });
    expect(result.current.showSplash).toBe(true);
  });

  it('re-arms for a rematch on the same table', () => {
    const { result, rerender } = renderHook(
      ({ at }) => useResultSplash('g1', true, at),
      { initialProps: { at: 100 } },
    );
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_DELAY_MS); });
    expect(result.current.showSplash).toBe(true);
    rerender({ at: 200 });
    expect(result.current.showSplash).toBe(false);
    act(() => { vi.advanceTimersByTime(RESULT_SPLASH_DELAY_MS); });
    expect(result.current.showSplash).toBe(true);
  });
});
