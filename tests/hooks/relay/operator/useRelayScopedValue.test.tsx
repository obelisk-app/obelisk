import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRelayScopedValue, type RelayScopedSubscribe } from '@/hooks/relay/operator/useRelayScopedValue';

const RELAY = 'wss://relay.example';
const AUTHORS = ['a'.repeat(64)];
const EMPTY = { updatedAt: 0, name: '' };

/** A subscriber that paints a cached value synchronously, as `subscribeLayout` does. */
function cachedSubscriber(value: typeof EMPTY) {
  const listeners = new Set<(v: typeof EMPTY) => void>();
  const subscribe: RelayScopedSubscribe<typeof EMPTY> = vi.fn((_relay, _authors, onChange) => {
    // A fresh object each time, the way a cache read parses it.
    onChange({ ...value });
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  });
  return { subscribe, push: (v: typeof EMPTY) => listeners.forEach((l) => l(v)) };
}

const flush = () => act(async () => { await Promise.resolve(); });

describe('useRelayScopedValue', () => {
  it('shows the cached value once the synchronous delivery is flushed', async () => {
    const { subscribe } = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    const { result } = renderHook(() => useRelayScopedValue(RELAY, AUTHORS, subscribe, EMPTY));
    await flush();
    expect(result.current).toEqual({ updatedAt: 5, name: 'cached' });
  });

  it('applies later live updates', async () => {
    const sub = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    const { result } = renderHook(() => useRelayScopedValue(RELAY, AUTHORS, sub.subscribe, EMPTY));
    await flush();
    act(() => sub.push({ updatedAt: 9, name: 'live' }));
    expect(result.current).toEqual({ updatedAt: 9, name: 'live' });
  });

  it('an equal value is not stored again (React may render once to bail out)', async () => {
    const sub = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    let renders = 0;
    renderHook(() => { renders++; return useRelayScopedValue(RELAY, AUTHORS, sub.subscribe, EMPTY); });
    await flush();
    const before = renders;
    act(() => sub.push({ updatedAt: 5, name: 'cached' }));
    act(() => sub.push({ updatedAt: 5, name: 'cached' }));
    expect(renders).toBeLessThanOrEqual(before + 1);
  });

  it('survives being resubscribed on every render (the React #185 loop)', async () => {
    const sub = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    // A new author array each render whose content alternates forces a
    // resubscribe every commit, the shape of the sidebar loop.
    let flip = false;
    const { result } = renderHook(() => {
      flip = !flip;
      return useRelayScopedValue(RELAY, flip ? AUTHORS : [...AUTHORS, 'b'.repeat(64)], sub.subscribe, EMPTY);
    });
    await flush();
    await flush();
    expect(result.current).toEqual({ updatedAt: 5, name: 'cached' });
  });

  it('a new subscribe function each render does not resubscribe (the production #185 loop)', async () => {
    const sub = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    // The production bundle returns a fresh function on every read of a
    // self-recursive module export, so the hook sees a new `subscribe` each render.
    const { result, rerender } = renderHook(() =>
      useRelayScopedValue(RELAY, AUTHORS, (...args: Parameters<typeof sub.subscribe>) => sub.subscribe(...args), EMPTY),
    );
    await flush();
    rerender();
    rerender();
    await flush();
    expect(sub.subscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({ updatedAt: 5, name: 'cached' });
  });

  it('ignores a delivery after unmount', async () => {
    const { subscribe } = cachedSubscriber({ updatedAt: 5, name: 'cached' });
    const { unmount } = renderHook(() => useRelayScopedValue(RELAY, AUTHORS, subscribe, EMPTY));
    unmount();
    await expect(flush()).resolves.toBeUndefined();
  });
});
