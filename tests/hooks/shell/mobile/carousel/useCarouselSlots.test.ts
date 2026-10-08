import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { initialNav } from '@/constants/shell/mobile';
import { useCarouselSlots } from '@/hooks/shell/mobile/carousel/useCarouselSlots';
import type { NavState } from '@/utils/shell/mobile/url-state';
import { neighborsFor } from '@/utils/shell/mobile/swipe-nav';

const at = (screen: NavState['screen']): NavState => ({ ...initialNav, screen });
const mounted = (slots: ReturnType<typeof useCarouselSlots>) => slots.filter((slot) => slot.mounted).map((slot) => slot.screen);
describe('carousel tab activation', () => {
  it('defers unvisited tabs, exposes swipe neighbors immediately, and retains them after cancellation', () => {
    const { result, rerender } = renderHook(({ nav, dragging }) => useCarouselSlots(nav, neighborsFor(nav), dragging), {
      initialProps: { nav: at('server'), dragging: false },
    });
    expect(mounted(result.current)).toEqual(['server']);
    rerender({ nav: at('server'), dragging: true });
    expect(mounted(result.current)).toEqual(['server', 'feed']);
    rerender({ nav: at('server'), dragging: false });
    expect(mounted(result.current)).toEqual(['server', 'feed']);
    rerender({ nav: at('inbox'), dragging: false });
    expect(mounted(result.current)).toEqual(['server', 'feed', 'inbox']);
  });
  it('mounts the parent behind a deep-linked overlay without starting the other tab trees', () => {
    const nav = { ...at('channel'), groupId: 'channel' };
    const { result } = renderHook(() => useCarouselSlots(nav, neighborsFor(nav), false));
    expect(mounted(result.current)).toEqual(['server']);
  });
});
