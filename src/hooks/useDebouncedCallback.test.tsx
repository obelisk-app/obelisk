import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useDebouncedCallback } from './useDebouncedCallback';

describe('useDebouncedCallback', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('delays the callback by `delayMs`', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => { result.current.run(); });
    expect(fn).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(299); });
    expect(fn).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid consecutive calls into the last one', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => { result.current.run('a'); });
    act(() => { vi.advanceTimersByTime(100); result.current.run('b'); });
    act(() => { vi.advanceTimersByTime(100); result.current.run('c'); });
    act(() => { vi.advanceTimersByTime(299); });
    expect(fn).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(1); });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('c');
  });

  it('calls the latest callback closure (ref-latched)', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { result, rerender } = renderHook(
      ({ cb }: { cb: () => void }) => useDebouncedCallback(cb, 300),
      { initialProps: { cb: first } },
    );

    act(() => { result.current.run(); });
    rerender({ cb: second });
    act(() => { vi.advanceTimersByTime(300); });

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cancel() discards a pending call', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => { result.current.run(); });
    act(() => { result.current.cancel(); });
    act(() => { vi.advanceTimersByTime(1000); });

    expect(fn).not.toHaveBeenCalled();
  });

  it('cancel() is a no-op when nothing is pending', () => {
    const fn = vi.fn();
    const { result } = renderHook(() => useDebouncedCallback(fn, 300));

    expect(() => act(() => { result.current.cancel(); })).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it('cancels any pending call on unmount', () => {
    const fn = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedCallback(fn, 300));

    act(() => { result.current.run(); });
    unmount();
    act(() => { vi.advanceTimersByTime(1000); });

    expect(fn).not.toHaveBeenCalled();
  });
});
