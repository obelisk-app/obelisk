import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChatStore } from '@/store/chat';
import { urlFor, type NavState } from '@/utils/shell/mobile/url-state';
import { initialNav } from '@/constants/shell/mobile';

vi.mock('@/utils/shell/mobile/swipe-target', () => ({
  shouldIgnoreMobileSwipeTarget: (target: EventTarget | null) =>
    !!target && (target as HTMLElement).dataset?.ignore === '1',
}));

import { useScreenCarousel, type SlideDir } from '@/hooks/shell/mobile/carousel/useScreenCarousel';

const WIDTH = 300;

function touch(x: number, y: number, target: EventTarget = document.body) {
  return { touches: [{ clientX: x, clientY: y }], target } as unknown as React.TouchEvent;
}

function harness(nav: NavState = initialNav) {
  const navRef = { current: nav };
  const relayRef = { current: 'wss://relay.test' };
  const pushNav = vi.fn((updater: (n: NavState) => NavState, _dir?: 'forward' | 'back') => { navRef.current = updater(navRef.current); });
  const setNav = vi.fn((next: NavState | ((n: NavState) => NavState)) => {
    navRef.current = typeof next === 'function' ? next(navRef.current) : next;
  });
  const setSlideDir = vi.fn();
  const layer = document.createElement('div');
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: WIDTH, configurable: true });
  const dragLayerRef = { current: layer };
  const screensHostRef = { current: host };
  const suppressSlideRef = { current: false };
  const view = renderHook(
    ({ nav: n, slideDir }: { nav: NavState; slideDir: SlideDir }) => useScreenCarousel({
      nav: n, navRef, relayRef, pushNav, setNav, slideDir, setSlideDir, dragLayerRef, screensHostRef, suppressSlideRef,
    }),
    { initialProps: { nav, slideDir: null } },
  );
  return { ...view, navRef, pushNav, setNav, setSlideDir, layer, host, suppressSlideRef };
}

beforeEach(() => {
  vi.useFakeTimers();
  useChatStore.setState({ activeChannelId: 'g1' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useScreenCarousel: drag', () => {
  it('tracks a horizontal drag with the finger and commits to the next tab after the slide', () => {
    const h = harness();
    act(() => { h.result.current.onTouchStart(touch(200, 100)); });
    act(() => { h.result.current.onTouchMove(touch(50, 102)); });
    expect(h.result.current.isDragging).toBe(true);
    expect(h.layer.style.transform).toBe('translateX(-150px)');

    act(() => { h.result.current.onTouchEnd({} as React.TouchEvent); });
    // Animated first, pushed after: the layer slides the full width, the
    // nav changes only once the slide is over.
    expect(h.layer.style.transform).toBe(`translateX(-${WIDTH}px)`);
    expect(h.pushNav).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(180); });
    expect(h.pushNav).toHaveBeenCalledTimes(1);
    expect(h.navRef.current).toEqual({ ...initialNav, screen: 'feed' });
    expect(h.pushNav.mock.calls[0][1]).toBe('forward');
    // The freshly mounted tab must not replay a slide-in over the drag.
    expect(h.suppressSlideRef.current).toBe(true);
    expect(h.result.current.isDragging).toBe(false);
    // A top-level switch never lands on a remembered channel.
    expect(useChatStore.getState().activeChannelId).toBeNull();
  });

  it('leaves a vertical drag to the screen\'s own scroller', () => {
    const h = harness();
    act(() => { h.result.current.onTouchStart(touch(200, 100)); });
    act(() => { h.result.current.onTouchMove(touch(205, 200)); });
    expect(h.result.current.isDragging).toBe(false);
    expect(h.layer.style.transform).toBe('');
    act(() => { h.result.current.onTouchEnd({} as React.TouchEvent); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(h.pushNav).not.toHaveBeenCalled();
  });

  it('rubber-bands when there is no tab on that side, and snaps back on release', () => {
    // 'server' is the first tab: nothing to its left.
    const h = harness();
    act(() => { h.result.current.onTouchStart(touch(100, 100)); });
    act(() => { h.result.current.onTouchMove(touch(200, 100)); });
    expect(h.layer.style.transform).toBe('translateX(30px)');
    act(() => { h.result.current.onTouchEnd({} as React.TouchEvent); });
    expect(h.layer.style.transform).toBe('translateX(0)');
    act(() => { vi.advanceTimersByTime(180); });
    expect(h.pushNav).not.toHaveBeenCalled();
    expect(h.result.current.isDragging).toBe(false);
  });

  it('ignores a touch that starts inside another horizontal scroller', () => {
    const h = harness();
    const strip = document.createElement('div');
    strip.dataset.ignore = '1';
    act(() => { h.result.current.onTouchStart(touch(200, 100, strip)); });
    act(() => { h.result.current.onTouchMove(touch(50, 100)); });
    expect(h.result.current.isDragging).toBe(false);
    expect(h.layer.style.transform).toBe('');
  });

  it('a cancelled drag reverts without navigating', () => {
    const h = harness();
    act(() => { h.result.current.onTouchStart(touch(200, 100)); });
    act(() => { h.result.current.onTouchMove(touch(50, 100)); });
    act(() => { h.result.current.onTouchCancel(); });
    expect(h.layer.style.transform).toBe('translateX(0)');
    act(() => { vi.advanceTimersByTime(180); });
    expect(h.pushNav).not.toHaveBeenCalled();
  });

  it('reports the neighbours of the current tab', () => {
    const h = harness();
    expect(h.result.current.dragNeighbors).toEqual({ left: null, right: 'feed' });
  });
});

describe('useScreenCarousel: tab presses', () => {
  it('tapping the active tab does nothing', () => {
    const h = harness();
    act(() => { h.result.current.onTabPress('server'); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(h.pushNav).not.toHaveBeenCalled();
    expect(h.setNav).not.toHaveBeenCalled();
  });

  it('tapping an adjacent tab slides the layer, then pushes the bare tab', () => {
    const h = harness();
    act(() => { h.result.current.onTabPress('feed'); });
    expect(h.result.current.isDragging).toBe(true);
    expect(h.layer.style.transform).toBe(`translateX(-${WIDTH}px)`);
    expect(h.pushNav).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(180); });
    expect(h.navRef.current).toEqual({ ...initialNav, screen: 'feed' });
    expect(h.suppressSlideRef.current).toBe(true);
    expect(h.result.current.isDragging).toBe(false);
  });

  it('tapping a non-adjacent tab pushes it at once, without the carousel slide', () => {
    const h = harness();
    act(() => { h.result.current.onTabPress('inbox'); });
    expect(h.pushNav).toHaveBeenCalledTimes(1);
    expect(h.navRef.current).toEqual({ ...initialNav, screen: 'inbox' });
    expect(h.result.current.isDragging).toBe(false);
  });

  it('tapping the tab a sub-screen belongs to pops to the bare tab by replacing history', () => {
    const sub: NavState = { ...initialNav, screen: 'channel', groupId: 'g1', parentScreen: 'server' };
    window.history.replaceState({ nav: sub, phoneHistory: true, custom: 'preserved' }, '', '/es/app?c=g1');
    const h = harness(sub);
    const replaceState = vi.spyOn(window.history, 'replaceState');
    act(() => { h.result.current.onTabPress('server'); });
    expect(h.setNav).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(180); });
    const bare: NavState = { ...initialNav, screen: 'server' };
    expect(h.setNav).toHaveBeenCalledWith(bare);
    expect(h.navRef.current).toEqual(bare);
    // replaceState, not pushState: back from the bare tab must lead to
    // whatever preceded the sub-screen, not back into it.
    expect(replaceState).toHaveBeenCalledWith({ nav: bare, phoneHistory: true, custom: 'preserved' }, '', urlFor(bare, 'wss://relay.test'));
    expect(h.pushNav).not.toHaveBeenCalled();
    expect(useChatStore.getState().activeChannelId).toBeNull();
    replaceState.mockRestore();
  });

  it('a direct navigation cancels a pending tab animation', () => {
    const h = harness();
    act(() => { h.result.current.onTabPress('feed'); });
    act(() => { h.result.current.cancelPendingTabTransition(); });
    expect(h.result.current.isDragging).toBe(false);
    expect(h.layer.style.transform).toBe('');
    act(() => { vi.advanceTimersByTime(200); });
    expect(h.pushNav).not.toHaveBeenCalled();
  });
});
