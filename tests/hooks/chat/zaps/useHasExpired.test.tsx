import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHasExpired } from '@/hooks/chat/zaps/useHasExpired';

const NOW = new Date('2026-10-05T12:00:00Z');
const nowSeconds = () => Math.floor(Date.now() / 1000);

describe('useHasExpired', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('flips at the expiry instant with no re-render from outside', () => {
    const at = nowSeconds() + 2;
    const { result } = renderHook(() => useHasExpired(at));
    expect(result.current).toBe(false);
    // expiresAt is 12:00:02; "expired" means expiresAt < floor(now), so the flip is due at 12:00:03.
    act(() => { vi.advanceTimersByTime(2_999); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe(true);
  });

  it('is already true for a deadline in the past', () => {
    const at = nowSeconds() - 60;
    const { result } = renderHook(() => useHasExpired(at));
    expect(result.current).toBe(true);
  });

  it('never expires without a deadline', () => {
    const none = renderHook(() => useHasExpired(undefined));
    const zero = renderHook(() => useHasExpired(0));
    act(() => { vi.advanceTimersByTime(365 * 24 * 60 * 60 * 1000); });
    expect(none.result.current).toBe(false);
    expect(zero.result.current).toBe(false);
  });

  it('re-arms past the setTimeout ceiling instead of firing at once', () => {
    const days30 = 30 * 24 * 60 * 60;
    const at = nowSeconds() + days30;
    const { result } = renderHook(() => useHasExpired(at));
    act(() => { vi.advanceTimersByTime(2 ** 31); });
    expect(result.current).toBe(false);
    act(() => { vi.advanceTimersByTime(days30 * 1000 + 1000 - 2 ** 31); });
    expect(result.current).toBe(true);
  });

  it('follows a changed deadline', () => {
    const { result, rerender } = renderHook(({ at }: { at: number }) => useHasExpired(at), {
      initialProps: { at: nowSeconds() + 100 },
    });
    expect(result.current).toBe(false);
    rerender({ at: nowSeconds() - 1 });
    expect(result.current).toBe(true);
  });

  it('clears its timer on unmount', () => {
    const clear = vi.spyOn(window, 'clearTimeout');
    const at = nowSeconds() + 100;
    const { unmount } = renderHook(() => useHasExpired(at));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
