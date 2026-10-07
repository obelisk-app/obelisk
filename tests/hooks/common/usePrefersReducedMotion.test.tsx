import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { usePrefersReducedMotion } from '@/hooks/common/usePrefersReducedMotion';

/** A controllable `matchMedia`: flip `reduced` and fire `change` like the OS would. */
function installMatchMedia(reduced: boolean) {
  const listeners = new Set<() => void>();
  const state = { reduced };
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return state.reduced && query.includes('prefers-reduced-motion'); },
    media: query,
    addEventListener: (_type: string, fn: () => void) => { listeners.add(fn); },
    removeEventListener: (_type: string, fn: () => void) => { listeners.delete(fn); },
  })));
  return {
    set(next: boolean) { state.reduced = next; for (const fn of listeners) fn(); },
    listenerCount: () => listeners.size,
  };
}

describe('usePrefersReducedMotion', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the query on the first render, with no wrong-answer frame', () => {
    installMatchMedia(true);
    const { result } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(true);
  });

  it('is false when the reader has no preference', () => {
    installMatchMedia(false);
    expect(renderHook(() => usePrefersReducedMotion()).result.current).toBe(false);
  });

  it('follows a change to the OS setting while mounted, and unsubscribes on unmount', () => {
    const mq = installMatchMedia(false);
    const { result, unmount } = renderHook(() => usePrefersReducedMotion());
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    expect(mq.listenerCount()).toBe(1);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });
});
