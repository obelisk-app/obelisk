import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FeedState } from '@/hooks/social/feed/useFeed';

const mocks = vi.hoisted(() => ({
  watchSentinel: vi.fn(),
  watchAtTop: vi.fn(() => () => {}),
  watchPullToRefresh: vi.fn(() => () => {}),
}));
vi.mock('@/services/social/feed-scroll', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/social/feed-scroll')>()),
  watchSentinel: mocks.watchSentinel,
  watchAtTop: mocks.watchAtTop,
  watchPullToRefresh: mocks.watchPullToRefresh,
}));

import { useFeedList } from '@/hooks/social/feed/useFeedList';

const state = (patch: Partial<FeedState> = {}): FeedState => ({
  notes: [], repostersByTarget: new Map(), loading: false, loadingMore: false, error: false, exhausted: false,
  pendingCount: 0, refresh: vi.fn(), loadMore: vi.fn(), showPending: vi.fn(), ...patch,
});

describe('useFeedList', () => {
  it('watches the explicit scroller for the top and for pulls', () => {
    const el = document.createElement('div');
    const onAtTopChange = vi.fn();
    const s = state();
    renderHook(() => useFeedList({ state: s, scrollRef: { current: el }, onAtTopChange }));
    expect(mocks.watchAtTop).toHaveBeenCalledWith(el, onAtTopChange);
    expect(mocks.watchPullToRefresh).toHaveBeenCalledWith(el, s.refresh, expect.objectContaining({ current: 0 }));
  });

  it('falls back to the window when nothing scrolls', () => {
    renderHook(() => useFeedList({ state: state() }));
    expect(mocks.watchAtTop).toHaveBeenLastCalledWith(window, undefined);
  });

  it('stops paging once the feed is exhausted', () => {
    mocks.watchSentinel.mockClear();
    const { rerender } = renderHook(({ s }) => useFeedList({ state: s }), { initialProps: { s: state() } });
    expect(mocks.watchSentinel).toHaveBeenCalledTimes(1);
    rerender({ s: state({ exhausted: true }) });
    expect(mocks.watchSentinel).toHaveBeenCalledTimes(1);
  });
});
