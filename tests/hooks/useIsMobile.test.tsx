import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOBILE_QUERY, useIsMobile } from '@/hooks/useIsMobile';

function installMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const state = { matches };
  const queries: string[] = [];
  vi.stubGlobal('matchMedia', vi.fn((query: string) => {
    queries.push(query);
    return {
      get matches() { return state.matches; },
      media: query,
      addEventListener: (_type: string, fn: () => void) => { listeners.add(fn); },
      removeEventListener: (_type: string, fn: () => void) => { listeners.delete(fn); },
    };
  }));
  return {
    queries,
    set(next: boolean) { state.matches = next; for (const fn of listeners) fn(); },
    listenerCount: () => listeners.size,
  };
}

describe('useIsMobile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is null on the first render, then answers the lg breakpoint query', () => {
    const mq = installMatchMedia(true);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    expect(mq.queries).toEqual([MOBILE_QUERY]);
    expect(MOBILE_QUERY).toBe('(max-width: 1023px)');
  });

  it('follows a resize across the breakpoint and unsubscribes on unmount', () => {
    const mq = installMatchMedia(false);
    const { result, unmount } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    act(() => mq.set(true));
    expect(result.current).toBe(true);
    expect(mq.listenerCount()).toBe(1);
    unmount();
    expect(mq.listenerCount()).toBe(0);
  });

  it('settles on desktop when matchMedia is missing', async () => {
    vi.stubGlobal('matchMedia', undefined);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });
});
