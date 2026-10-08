import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCopyToClipboard } from '@/hooks/common/useCopyToClipboard';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe('useCopyToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes to clipboard and flips copied to true when no key is given', async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy('hello');
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
    expect(result.current.copied).toBe(true);
    expect(result.current.error).toBe(false);
  });

  it('stores the row key when a key is given', async () => {
    const { result } = renderHook(() => useCopyToClipboard());

    await act(async () => {
      await result.current.copy('https://example.com/invite/abc', 'abc');
    });

    expect(result.current.copied).toBe('abc');
  });

  it('auto-clears copied after the reset window', async () => {
    const { result } = renderHook(() => useCopyToClipboard(1500));

    await act(async () => { await result.current.copy('text'); });
    expect(result.current.copied).toBe(true);

    act(() => { vi.advanceTimersByTime(1499); });
    expect(result.current.copied).toBe(true);

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current.copied).toBe(null);
  });

  it('debounces the reset - a second copy resets the timer', async () => {
    const { result } = renderHook(() => useCopyToClipboard(1000));

    await act(async () => { await result.current.copy('first'); });
    act(() => { vi.advanceTimersByTime(800); });
    await act(async () => { await result.current.copy('second', 'key2'); });

    act(() => { vi.advanceTimersByTime(800); });
    expect(result.current.copied).toBe('key2');

    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current.copied).toBe(null);
  });

  it('flips error and returns false when the clipboard rejects, then auto-clears', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const { result } = renderHook(() => useCopyToClipboard(500));

    let ok: boolean = true;
    await act(async () => { ok = await result.current.copy('text'); });

    expect(ok).toBe(false);
    expect(result.current.copied).toBe(null);
    expect(result.current.error).toBe(true);

    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.error).toBe(false);
  });

  it('runs onReset when the flag auto-clears (flash-then-close menu pattern)', async () => {
    const onReset = vi.fn();
    const { result } = renderHook(() => useCopyToClipboard({ resetMs: 800, onReset }));

    await act(async () => { await result.current.copy('text'); });
    expect(onReset).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(800); });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timeout on unmount', async () => {
    const { result, unmount } = renderHook(() => useCopyToClipboard(2000));

    await act(async () => { await result.current.copy('text'); });
    unmount();

    expect(() => act(() => { vi.advanceTimersByTime(5000); })).not.toThrow();
  });

  it('keeps the plain-number shorthand for resetMs', async () => {
    const { result } = renderHook(() => useCopyToClipboard(500));
    await act(async () => { await result.current.copy('text'); });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current.copied).toBe(null);
  });
  it.each(['resolve', 'reject'] as const)('ignores an older %s after the latest copy succeeds', async (settle) => {
    const first = deferred();
    const second = deferred();
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const onReset = vi.fn();
    const { result } = renderHook(() => useCopyToClipboard({ resetMs: 500, onReset }));
    let older!: Promise<boolean>;
    let newer!: Promise<boolean>;
    act(() => { older = result.current.copy('first', 'first'); newer = result.current.copy('second', 'second'); });
    await act(async () => { second.resolve(); await newer; });
    act(() => { vi.advanceTimersByTime(300); });
    await act(async () => {
      if (settle === 'resolve') first.resolve();
      else first.reject(new Error('denied'));
      expect(await older).toBe(settle === 'resolve');
    });
    expect(result.current.copied).toBe('second');
    expect(result.current.error).toBe(false);
    act(() => { vi.advanceTimersByTime(200); });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('does not let an older success replace the latest failure', async () => {
    const first = deferred();
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(first.promise).mockRejectedValueOnce(new Error('denied'));
    const { result } = renderHook(() => useCopyToClipboard());
    let older!: Promise<boolean>;
    act(() => { older = result.current.copy('first'); });
    await act(async () => { expect(await result.current.copy('second')).toBe(false); });
    await act(async () => { first.resolve(); expect(await older).toBe(true); });
    expect(result.current.copied).toBeNull();
    expect(result.current.error).toBe(true);
  });

  it('cancels the previous reset while a new copy is pending', async () => {
    const pending = deferred();
    const onReset = vi.fn();
    const { result } = renderHook(() => useCopyToClipboard({ resetMs: 500, onReset }));
    await act(async () => { await result.current.copy('first'); });
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(pending.promise);
    let copy!: Promise<boolean>;
    act(() => { copy = result.current.copy('second'); vi.advanceTimersByTime(1000); });
    expect(onReset).not.toHaveBeenCalled();
    await act(async () => { pending.resolve(); await copy; });
    act(() => { vi.advanceTimersByTime(500); });
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it.each(['resolve', 'reject'] as const)('does not schedule feedback when a pending write %ss after unmount', async (settle) => {
    const pending = deferred();
    vi.mocked(navigator.clipboard.writeText).mockReturnValueOnce(pending.promise);
    const onReset = vi.fn();
    const { result, unmount } = renderHook(() => useCopyToClipboard({ resetMs: 500, onReset }));
    const copy = result.current.copy('text');
    unmount();
    if (settle === 'resolve') pending.resolve();
    else pending.reject(new Error('denied'));
    expect(await copy).toBe(settle === 'resolve');
    expect(vi.getTimerCount()).toBe(0);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(onReset).not.toHaveBeenCalled();
  });

});
