import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AT_TOP_PX, PULL_REFRESH_COOLDOWN_MS, findFeedScroller, watchAtTop, watchPullToRefresh, watchSentinel,
} from '@/services/social/feed-scroll';

type Entry = { isIntersecting: boolean };

describe('watchSentinel', () => {
  let callback: ((entries: Entry[]) => void) | null = null;
  const disconnect = vi.fn();
  beforeEach(() => {
    callback = null;
    disconnect.mockReset();
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb: (entries: Entry[]) => void, public opts: { rootMargin: string }) { callback = cb; }
      observe() {}
      disconnect() { disconnect(); }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('calls back when the node comes into range and disconnects on cleanup', () => {
    const onReach = vi.fn();
    const stop = watchSentinel(document.createElement('div'), onReach);
    callback!([{ isIntersecting: false }]);
    expect(onReach).not.toHaveBeenCalled();
    callback!([{ isIntersecting: true }]);
    expect(onReach).toHaveBeenCalledTimes(1);
    stop!();
    expect(disconnect).toHaveBeenCalled();
  });

  it('does nothing without a node or an observer', () => {
    expect(watchSentinel(null, vi.fn())).toBeUndefined();
    vi.stubGlobal('IntersectionObserver', undefined);
    expect(watchSentinel(document.createElement('div'), vi.fn())).toBeUndefined();
  });
});

describe('findFeedScroller', () => {
  it('prefers the explicit scroller', () => {
    const el = document.createElement('div');
    expect(findFeedScroller(el, null)).toBe(el);
  });

  it('walks up to the nearest scrolling ancestor, else the window', () => {
    const outer = document.createElement('div');
    outer.style.overflowY = 'scroll';
    const inner = document.createElement('div');
    const node = document.createElement('div');
    outer.appendChild(inner);
    inner.appendChild(node);
    expect(findFeedScroller(null, node)).toBe(outer);
    expect(findFeedScroller(undefined, document.createElement('div'))).toBe(window);
  });
});

function scroller(top: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', { value: top, writable: true });
  return el;
}

describe('watchAtTop', () => {
  it('reports now and on scroll, and stops on cleanup', () => {
    const el = scroller(0);
    const report = vi.fn();
    const stop = watchAtTop(el, report);
    expect(report).toHaveBeenLastCalledWith(true);
    el.scrollTop = AT_TOP_PX + 1;
    el.dispatchEvent(new Event('scroll'));
    expect(report).toHaveBeenLastCalledWith(false);
    stop();
    el.scrollTop = 0;
    el.dispatchEvent(new Event('scroll'));
    expect(report).toHaveBeenCalledTimes(2);
  });
});

describe('watchPullToRefresh', () => {
  const wheel = (el: HTMLElement, deltaY: number) => el.dispatchEvent(new WheelEvent('wheel', { deltaY }));

  it('refreshes after a deliberate pull, once per cooldown', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const el = scroller(0);
    const refresh = vi.fn();
    const last = { current: 0 };
    const stop = watchPullToRefresh(el, refresh, last);
    wheel(el, -70);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(last.current).toBe(100_000);
    wheel(el, -70);
    expect(refresh).toHaveBeenCalledTimes(1);
    now.mockReturnValue(100_000 + PULL_REFRESH_COOLDOWN_MS);
    wheel(el, -70);
    expect(refresh).toHaveBeenCalledTimes(2);
    stop();
    now.mockReturnValue(999_999);
    wheel(el, -70);
    expect(refresh).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });

  it('resets the pull on a downward scroll or away from the top', () => {
    const el = scroller(0);
    const refresh = vi.fn();
    watchPullToRefresh(el, refresh, { current: 0 });
    wheel(el, -40);
    wheel(el, 10);
    wheel(el, -40);
    expect(refresh).not.toHaveBeenCalled();
  });
});
