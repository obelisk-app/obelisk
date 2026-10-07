import { act, renderHook, waitFor } from '@testing-library/react';
import type { FocusEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/facade/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { warmBridgeFrontDoor } from '@tests/support/warm-bridge-modules';
import { PROFILE_CACHE_KEY, SESSION_KEY } from '@/hooks/marketing/useSavedAccount';

const push = vi.fn();
vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

import { useNavbar } from '@/hooks/marketing/useNavbar';

const ME = 'e'.repeat(64);
const logout = vi.fn().mockResolvedValue(undefined);
const wrapper = ({ children }: { children: ReactNode }) => <LocaleProvider initialLocale="en">{children}</LocaleProvider>;

warmBridgeFrontDoor();

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
  logout.mockClear();
  registerBridge(fakeBridge({}, { logout }));
});

afterEach(() => unregisterBridge());

function signIn() {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ pubKeyHex: ME, loginMethod: 'nip07', relayUrl: 'wss://r.example' }));
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ byPubkey: { [ME]: { content: JSON.stringify({ name: 'Eve' }) } } }));
}

describe('useNavbar', () => {
  it('signed out: no account, the anonymous name, and Launch app goes to the app', () => {
    const { result } = renderHook(() => useNavbar(), { wrapper });
    expect(result.current.account).toBeNull();
    expect(result.current.name).toBe('Anon');
    expect(result.current.npub).toBe('');
    act(() => result.current.launchApp());
    expect(push).toHaveBeenCalledWith('/app');
  });

  it('signed in: the saved name and a short npub', () => {
    signIn();
    const { result } = renderHook(() => useNavbar(), { wrapper });
    expect(result.current.name).toBe('Eve');
    expect(result.current.npub).toMatch(/^npub1.{5}….{4}$/);
  });

  it('turns the bar solid once the page scrolls past 20px', () => {
    const { result } = renderHook(() => useNavbar(), { wrapper });
    expect(result.current.scrolled).toBe(false);
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 40, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current.scrolled).toBe(true);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('closes the guides menu when focus leaves it, not when it moves inside it', () => {
    const { result } = renderHook(() => useNavbar(), { wrapper });
    const box = document.createElement('div');
    const inside = document.createElement('a');
    box.appendChild(inside);
    act(() => result.current.guides.show());
    act(() => result.current.guides.onBlur({ currentTarget: box, relatedTarget: inside } as unknown as FocusEvent<HTMLElement>));
    expect(result.current.guides.open).toBe(true);
    act(() => result.current.guides.onBlur({ currentTarget: box, relatedTarget: document.body } as unknown as FocusEvent<HTMLElement>));
    expect(result.current.guides.open).toBe(false);
  });

  it('disconnects through the bridge, closes the menu and goes home', async () => {
    signIn();
    const { result } = renderHook(() => useNavbar(), { wrapper });
    act(() => result.current.menu.toggle());
    expect(result.current.menu.open).toBe(true);
    act(() => result.current.menu.logout());
    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(logout).toHaveBeenCalled();
    expect(result.current.menu.open).toBe(false);
  });
});
