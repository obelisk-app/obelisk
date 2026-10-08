import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { bridgeWrapper } from '@tests/support/render-with-bridge';
import { initialNav } from '@/constants/shell/mobile';
import { useMobileHistorySync } from '@/hooks/shell/mobile/nav/useMobileHistorySync';
import { useToastStore } from '@/store/feedback/toast';
import type { NavState } from '@/utils/shell/mobile/url-state';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }));

function mount() {
  const navRef = { current: initialNav };
  const inputs = {
    isLoggedIn: true, dmOptInEnabled: false, currentRelayUrl: '', navRef,
    relayRef: { current: null }, setNav: vi.fn(), setSlideDir: vi.fn(), suppressSlideRef: { current: false },
  };
  return renderHook(({ nav }: { nav: NavState }) => useMobileHistorySync({ ...inputs, nav }), {
    initialProps: { nav: initialNav }, wrapper: bridgeWrapper(fakeBridge()),
  });
}
const back = () => act(() => { window.dispatchEvent(new PopStateEvent('popstate', { state: { guard: true } })); });
beforeEach(() => {
  window.history.replaceState(null, '', '/app');
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-08T12:00:00Z'));
  push.mockClear();
  useToastStore.getState().clearToasts();
});
afterEach(() => { vi.useRealTimers(); });

describe('mobile exit feedback', () => {
  it('uses the shared store and confirms exit independently of hint dismissal', () => {
    mount();
    back();
    expect(useToastStore.getState().toasts).toMatchObject([{ title: 'Press back again to exit', durationMs: 2000 }]);
    expect(push).not.toHaveBeenCalled();
    act(() => { useToastStore.getState().clearToasts(); vi.advanceTimersByTime(1000); });
    back();
    expect(push).toHaveBeenCalledWith('/');
    expect(useToastStore.getState().toasts).toEqual([]);
  });
  it('rearms after the two-second window and replaces a stale hint', () => {
    mount();
    back();
    act(() => { vi.advanceTimersByTime(2001); });
    back();
    expect(push).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });
  it('resets exit confirmation on navigation changes and removes the hint on unmount', () => {
    const view = mount();
    back();
    view.rerender({ nav: { ...initialNav, screen: 'inbox' } });
    expect(useToastStore.getState().toasts).toEqual([]);
    act(() => { vi.advanceTimersByTime(1000); });
    back();
    expect(push).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts).toHaveLength(1);
    view.unmount();
    expect(useToastStore.getState().toasts).toEqual([]);
  });
});


describe('responsive history reentry', () => {
  it('reuses a seeded phone entry without pushing another guard or parent', () => {
    const nav = { ...initialNav, screen: 'dm-thread' as const, dmPeer: 'alice' };
    window.history.replaceState({ nav, phoneHistory: true, custom: 42 }, '', '/es/app?s=dm-thread&p=alice');
    const pushState = vi.spyOn(window.history, 'pushState');
    const first = mount();
    first.unmount();
    mount();
    expect(pushState).not.toHaveBeenCalled();
    expect(window.history.state).toMatchObject({ nav, phoneHistory: true, custom: 42 });
    expect(window.location.pathname).toBe('/es/app');
    pushState.mockRestore();
  });

  it('seeds the first phone visit from desktop once, then restores back and forward entries', () => {
    const dm = { ...initialNav, screen: 'dm-thread' as const, dmPeer: 'alice' };
    window.history.replaceState({ nav: dm }, '', '/pt/app?s=dm-thread&p=alice');
    const first = mount();
    expect(window.history.state).toMatchObject({ nav: dm, phoneHistory: true });
    first.unmount();
    const pushState = vi.spyOn(window.history, 'pushState');
    const navRef = { current: initialNav };
    const setNav = vi.fn();
    renderHook(() => useMobileHistorySync({
      isLoggedIn: true, dmOptInEnabled: true, currentRelayUrl: '', nav: dm, navRef,
      relayRef: { current: null }, setNav, setSlideDir: vi.fn(), suppressSlideRef: { current: false },
    }), { wrapper: bridgeWrapper(fakeBridge()) });
    expect(pushState).not.toHaveBeenCalled();
    for (const nav of [{ ...initialNav, screen: 'dms-list' as const }, dm]) {
      act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { nav, phoneHistory: true } })));
      expect(setNav).toHaveBeenLastCalledWith(nav);
      expect(navRef.current).toEqual(nav);
    }
    pushState.mockRestore();
  });
});
