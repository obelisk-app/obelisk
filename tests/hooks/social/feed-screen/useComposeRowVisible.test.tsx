import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useComposeRowVisible } from '@/hooks/social/feed-screen/useComposeRowVisible';

type Callback = (entries: Array<{ isIntersecting: boolean }>) => void;

function installObserver() {
  const created: Array<{ cb: Callback; root: unknown; observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  class FakeObserver {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(cb: Callback, options: { root: unknown }) {
      created.push({ cb, root: options.root, observe: this.observe, disconnect: this.disconnect });
    }
  }
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  return created;
}

afterEach(() => vi.unstubAllGlobals());

describe('useComposeRowVisible', () => {
  it('starts visible and follows the observer, rooted on the scroller', () => {
    const created = installObserver();
    const row = { current: document.createElement('div') };
    const scroller = { current: document.createElement('div') };
    const { result } = renderHook(() => useComposeRowVisible(row, scroller, 'me', null));
    expect(result.current).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].root).toBe(scroller.current);
    expect(created[0].observe).toHaveBeenCalledWith(row.current);
    act(() => created[0].cb([{ isIntersecting: false }]));
    expect(result.current).toBe(false);
  });

  it('re-attaches when the composer changes and disconnects the old observer', () => {
    const created = installObserver();
    const row = { current: document.createElement('div') };
    const scroller = { current: document.createElement('div') };
    const { rerender } = renderHook(
      ({ composer }) => useComposeRowVisible(row, scroller, 'me', composer),
      { initialProps: { composer: null as unknown } },
    );
    rerender({ composer: { kind: 'note' } });
    expect(created).toHaveLength(2);
    expect(created[0].disconnect).toHaveBeenCalled();
  });

  it('stays visible with no row to watch', () => {
    const created = installObserver();
    const { result } = renderHook(() => useComposeRowVisible({ current: null }, { current: null }, null, null));
    expect(result.current).toBe(true);
    expect(created).toHaveLength(0);
  });
});
