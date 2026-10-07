import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useScrollableRail } from '@/hooks/voice/room/useScrollableRail';

const prevMatch = window.matchMedia;
const prevRO = globalThis.ResizeObserver;

beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false }) as unknown as MediaQueryList);
  globalThis.ResizeObserver = class { observe() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  window.matchMedia = prevMatch;
  globalThis.ResizeObserver = prevRO;
});

describe('useScrollableRail', () => {
  it('shows the next arrow while there is more below, and scrolls by most of a screen', () => {
    const { result } = renderHook(() => useScrollableRail(null));
    const el = document.createElement('aside');
    Object.defineProperties(el, {
      scrollTop: { value: 0, writable: true }, clientHeight: { value: 100 }, scrollHeight: { value: 300 },
      scrollLeft: { value: 0 }, clientWidth: { value: 50 }, scrollWidth: { value: 50 },
    });
    el.scrollBy = vi.fn();
    result.current.railRef.current = el;
    act(() => { result.current.update(); });
    expect(result.current.canPrev).toBe(false);
    expect(result.current.canNext).toBe(true);
    result.current.scroll(1);
    expect(el.scrollBy).toHaveBeenCalledWith({ top: 80, behavior: 'smooth' });
  });
});
