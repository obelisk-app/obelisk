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
