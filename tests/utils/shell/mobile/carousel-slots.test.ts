import { describe, expect, it } from 'vitest';
import { overlayScreenKeyFor, rubberBandDx, slideClassFor, slotRoleFor, swipeAxis } from '@/utils/shell/mobile/carousel-slots';
import { initialNav, type NavState } from '@/utils/shell/mobile/url-state';
import { neighborsFor } from '@/utils/shell/mobile/swipe-nav';

const at = (patch: Partial<NavState>): NavState => ({ ...initialNav, ...patch });

describe('slotRoleFor', () => {
  it('puts the active tab in the middle and its neighbours either side', () => {
    const nav = at({ screen: 'feed' });
    const n = neighborsFor(nav);
    expect(slotRoleFor('feed', nav, n)).toBe('drag-curr');
    expect(slotRoleFor('server', nav, n)).toBe('drag-prev');
    expect(slotRoleFor('dms-list', nav, n)).toBe('drag-next');
    expect(slotRoleFor('settings-profile', nav, n)).toBe('drag-hidden');
  });

  it('keeps a sub-screen\'s parent tab in the middle, behind the overlay', () => {
    const nav = at({ screen: 'channel', groupId: 'g', parentScreen: 'server' });
    expect(slotRoleFor('server', nav, neighborsFor(nav))).toBe('drag-curr');
  });
});

describe('overlayScreenKeyFor', () => {
  it('keys a sheet by the screen underneath, so opening it does not remount that screen', () => {
    expect(overlayScreenKeyFor(at({ screen: 'msg-actions', baseScreen: 'forum' }))).toBe('forum');
    expect(overlayScreenKeyFor(at({ screen: 'zap-modal', baseScreen: null }))).toBe('channel');
  });

  it('is the screen itself otherwise', () => {
    expect(overlayScreenKeyFor(at({ screen: 'dm-thread' }))).toBe('dm-thread');
  });
});

describe('slideClassFor', () => {
  it('maps the direction to its animation class', () => {
    expect(slideClassFor(false, 'forward')).toBe('slide-forward');
    expect(slideClassFor(false, 'back')).toBe('slide-back');
    expect(slideClassFor(false, null)).toBe('');
  });

  it('mounts without a slide when suppressed', () => {
    expect(slideClassFor(true, 'forward')).toBe('');
  });
});

describe('swipeAxis', () => {
  it('stays undecided until the touch has moved 8px either way', () => {
    expect(swipeAxis(7, -7)).toBeNull();
  });

  it('is horizontal only when |dx| beats 1.2×|dy|', () => {
    expect(swipeAxis(13, 10)).toBe('horizontal');
    expect(swipeAxis(12, 10)).toBe('vertical');
    expect(swipeAxis(0, 9)).toBe('vertical');
  });
});

describe('rubberBandDx', () => {
  it('follows the finger when there is a neighbour on that side', () => {
    expect(rubberBandDx(100, { left: 'server', right: null })).toBe(100);
    expect(rubberBandDx(-100, { left: null, right: 'feed' })).toBe(-100);
  });

  it('resists at 30% when there is nothing to reveal', () => {
    expect(rubberBandDx(100, { left: null, right: 'feed' })).toBe(30);
    expect(rubberBandDx(-100, { left: 'server', right: null })).toBe(-30);
  });
});
