import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFeedFloatingControls } from '@/hooks/social/feed/useFeedFloatingControls';

describe('useFeedFloatingControls', () => {
  it('merges the pending notes, then scrolls to the top', () => {
    const order: string[] = [];
    const el = document.createElement('div');
    el.scrollTo = vi.fn(() => { order.push('scroll'); }) as never;
    const onShowPending = vi.fn(() => { order.push('pending'); });
    const { result } = renderHook(() => useFeedFloatingControls({ scrollRef: { current: el }, onShowPending }));
    result.current.backToTop();
    expect(order).toEqual(['pending', 'scroll']);
    expect(el.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });

  it('still merges when the scroller is gone', () => {
    const onShowPending = vi.fn();
    const { result } = renderHook(() => useFeedFloatingControls({ scrollRef: { current: null }, onShowPending }));
    result.current.backToTop();
    expect(onShowPending).toHaveBeenCalled();
  });
});
