import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { nip19 } from 'nostr-tools';
import { LocaleProvider } from '@tests/support/intl';

const ME = 'd'.repeat(64);
const pushMock = vi.fn();
const logout = vi.fn().mockResolvedValue(undefined);

vi.mock('@/i18n/navigation', async () => (await import('@tests/support/mocks/i18n-navigation')).navigationMock({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

import Navbar from '@/components/marketing/Navbar';
import { registerBridge, unregisterBridge } from '@/services/nostr-bridge/bridge-slot';
import { fakeBridge } from '@tests/support/fake-bridge';
import { warmBridgeFrontDoor } from '@tests/support/warm-bridge-modules';
import { PROFILE_CACHE_KEY } from '@/hooks/marketing/useSavedAccount';
import { STORAGE_KEY } from '@/services/nostr-bridge/session-storage';

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ pubKeyHex: ME, loginMethod: 'nip07', relayUrl: 'wss://r.example' }));
  localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({
    byPubkey: { [ME]: { content: JSON.stringify({ display_name: 'Dana', picture: 'https://x.example/d.png' }) } },
  }));
}

const renderNavbar = () => render(<LocaleProvider initialLocale="en"><Navbar /></LocaleProvider>);

// Only the disconnect path reaches the bridge, through a dynamic import of
// the real front door; its getBridge() resolves to this registered fake.
// The import is paid once, before any test's clock starts.
warmBridgeFrontDoor();

beforeEach(() => {
  registerBridge(fakeBridge({}, { logout }));
  localStorage.clear();
  saveSession();
  pushMock.mockClear();
  logout.mockClear();
});

afterEach(() => {
  unregisterBridge();
});

describe('Navbar account menu', () => {
  it('shows the avatar as remote media and the npub as a short label', () => {
    renderNavbar();
    const avatar = screen.getByRole('img', { name: 'Dana' });
    expect(avatar).toHaveAttribute('referrerpolicy', 'no-referrer');
    fireEvent.click(screen.getByTestId('nav-account-menu'));
    const npub = nip19.npubEncode(ME);
    expect(screen.getByText(`${npub.slice(0, 10)}…${npub.slice(-4)}`)).toBeInTheDocument();
  });

  it('is a menu of MenuItem rows: an in-app profile link and a red disconnect', async () => {
    renderNavbar();
    fireEvent.click(screen.getByTestId('nav-account-menu'));
    expect(screen.getByTestId('nav-account-menu')).toHaveAttribute('aria-expanded', 'true');
    const profile = screen.getByTestId('nav-profile-link');
    expect(profile).toHaveAttribute('role', 'menuitem');
    expect(profile).toHaveAttribute('href', '/app');
    expect(profile).not.toHaveAttribute('target');
    const disconnect = screen.getByTestId('nav-disconnect');
    expect(disconnect).toHaveClass('text-red-400');
    fireEvent.click(disconnect);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/'));
    expect(logout).toHaveBeenCalledTimes(1);
  });

  it('falls back to the logged-out look once the saved session is gone after disconnect', async () => {
    logout.mockImplementationOnce(async () => { localStorage.removeItem(STORAGE_KEY); });
    renderNavbar();
    fireEvent.click(screen.getByTestId('nav-account-menu'));
    fireEvent.click(screen.getByTestId('nav-disconnect'));
    await waitFor(() => expect(screen.queryByTestId('nav-account-menu')).toBeNull());
    expect(screen.getByRole('button', { name: 'Launch App' })).toBeInTheDocument();
  });

  it('shows the account from another tab signing in (storage event)', () => {
    localStorage.clear();
    renderNavbar();
    expect(screen.queryByTestId('nav-account-menu')).toBeNull();
    saveSession();
    act(() => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY })); });
    expect(screen.getByTestId('nav-account-menu')).toHaveTextContent('Dana');
  });

  it('closes on a press outside and on Escape, with no invisible backdrop', () => {
    renderNavbar();
    fireEvent.click(screen.getByTestId('nav-account-menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();

    fireEvent.click(screen.getByTestId('nav-account-menu'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('the trigger toggles the menu closed again', () => {
    renderNavbar();
    const trigger = screen.getByTestId('nav-account-menu');
    fireEvent.click(trigger);
    fireEvent.mouseDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('signed out, "Launch app" is a pill Button', () => {
    localStorage.clear();
    renderNavbar();
    const launch = screen.getByRole('button', { name: 'Launch App' });
    expect(launch).toHaveClass('lc-pill-primary');
    expect(launch).toHaveAttribute('type', 'button');
    fireEvent.click(launch);
    expect(pushMock).toHaveBeenCalledWith('/app');
  });
});

describe('Navbar bundle', () => {
  it('never imports the Nostr bridge statically, so the marketing pages do not download it', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/components/marketing/Navbar.tsx'), 'utf8');
    expect(src).not.toMatch(/^import[^;]*from '@\/services\/nostr-bridge'/m);
    expect(src).toContain("await import('@/services/nostr-bridge')");
  });
});
