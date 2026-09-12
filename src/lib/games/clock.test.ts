import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNowSeconds, __resetGameClocks } from './clock';

describe('useNowSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1_760_000_000_000);
    __resetGameClocks();
  });

  afterEach(() => {
    __resetGameClocks();
    vi.useRealTimers();
  });

  it('gives every subscriber at the same interval one timer and one value', () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const a = renderHook(() => useNowSeconds(30_000));
    const b = renderHook(() => useNowSeconds(30_000));
    const c = renderHook(() => useNowSeconds(30_000));

    expect(a.result.current).toBe(b.result.current);
    expect(b.result.current).toBe(c.result.current);

    // Past the alignment boundary, one interval is armed — not three.
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(setInterval).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(a.result.current).toBe(b.result.current);
    expect(a.result.current).toBeGreaterThan(1_760_000_000);
  });

  it('aligns the first tick to the interval boundary', () => {
    // 1_760_000_007_000 is 27s into a 30s epoch bucket, so the next boundary is
    // 3s away — a subscriber mounting here must tick then, not 30s later, or it
    // would drift permanently out of step with everyone already subscribed.
    vi.setSystemTime(1_760_000_007_000);
    const { result } = renderHook(() => useNowSeconds(30_000));
    const first = result.current;
    expect(first).toBe(1_760_000_007);

    act(() => { vi.advanceTimersByTime(2_999); });
    expect(result.current).toBe(first);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(1_760_000_010);

    // And from there it is on the boundary: every subsequent tick is a clean 30.
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current).toBe(1_760_000_040);
  });

  it('stops the timer when the last subscriber unmounts, and restarts after', () => {
    const clearInterval = vi.spyOn(globalThis, 'clearInterval');
    const a = renderHook(() => useNowSeconds(1_000));
    const b = renderHook(() => useNowSeconds(1_000));
    act(() => { vi.advanceTimersByTime(2_000); });

    a.unmount();
    expect(clearInterval).not.toHaveBeenCalled();
    b.unmount();
    expect(clearInterval).toHaveBeenCalled();

    // A clock nobody is watching must not leave a stale value behind.
    act(() => { vi.advanceTimersByTime(60_000); });
    const c = renderHook(() => useNowSeconds(1_000));
    expect(c.result.current).toBe(Math.floor(Date.now() / 1000));
  });

  it('keeps separate intervals separate', () => {
    const fast = renderHook(() => useNowSeconds(1_000));
    const slow = renderHook(() => useNowSeconds(30_000));
    const slowStart = slow.result.current;

    act(() => { vi.advanceTimersByTime(5_000); });
    expect(fast.result.current).toBe(slowStart + 5);
    expect(slow.result.current).toBe(slowStart);
  });
});
