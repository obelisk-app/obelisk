/**
 * The phone's relay rail pieces: what `RelayTile.test.tsx` beside the shell
 * does not pin. The tile's label sources (branding, NIP-11, host), its icon
 * fallback, the background-unread badge, the long-press payload, and the
 * banner's fallbacks and relay link.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';

const relayInfo = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: (url: string) => relayInfo.fetch(url),
}));

const branding = vi.hoisted(() => ({ use: vi.fn() }));
vi.mock('@/hooks/relay/branding/useRelayBranding', () => ({
  useRelayBranding: (url: string, operators: string[]) => branding.use(url, operators),
}));

const unread = vi.hoisted(() => ({ count: 0, keys: [] as Array<string | null | undefined> }));
vi.mock('@/hooks/notifications/useNotificationSelectors', () => ({
  useUnreadMentionCount: (relay: string | null | undefined) => {
    unread.keys.push(relay);
    return relay ? unread.count : 0;
  },
}));

// The pill probes social relays on mount; this file only checks what the
// banner hands it.
const pill = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));
vi.mock('@/components/relay/RelayStatusPill', () => ({
  default: (props: Record<string, unknown> & { onOpenSettings: () => void }) => {
    pill.props = props;
    return <button data-testid="pill-stub" onClick={props.onOpenSettings} />;
  },
}));
vi.mock('@/components/feedback/MobileSigningIndicator', () => ({
  default: () => <span data-testid="signing-stub" />,
}));

import { MobileServerRail } from '@/app/[locale]/app/mobile/rail/MobileServerRail';
import { MobileServerBanner } from '@/app/[locale]/app/mobile/rail/MobileServerBanner';
import { RelayTile } from '@/app/[locale]/app/mobile/rail/RelayTile';
import { OPEN_SETTINGS_EVENT } from '@/constants/settings/open-settings';

const renderLocalized = (ui: ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);
const flush = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  relayInfo.fetch.mockReset().mockResolvedValue(null);
  branding.use.mockReset().mockReturnValue({});
  unread.count = 0;
  unread.keys = [];
  pill.props = null;
});
afterEach(() => { vi.useRealTimers(); });

describe('RelayTile label and icon', () => {
  it('falls back to the short host before NIP-11 answers', () => {
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    expect(screen.getByText('relay.example')).toBeTruthy();
    expect(screen.getByRole('button').querySelector('img')).toHaveAttribute('src', 'https://favicon/wss://relay.example');
  });

  it('uses the NIP-11 name and asks branding for the operator it names', async () => {
    relayInfo.fetch.mockResolvedValue({ name: 'Example Relay', pubkey: 'op'.repeat(32) });
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    await flush();
    expect(screen.getByText('Example Relay')).toBeTruthy();
    expect(branding.use).toHaveBeenLastCalledWith('wss://relay.example', ['op'.repeat(32)]);
  });

  it('asks branding with no operators while NIP-11 has none', () => {
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    expect(branding.use).toHaveBeenLastCalledWith('wss://relay.example', []);
  });

  it('prefers the branding name over the NIP-11 name', async () => {
    relayInfo.fetch.mockResolvedValue({ name: 'Example Relay', pubkey: 'op'.repeat(32) });
    branding.use.mockReturnValue({ name: 'Branded' });
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    await flush();
    expect(screen.getByText('Branded')).toBeTruthy();
  });

  it('draws the label letter on a gradient once the favicon fails', () => {
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    const img = screen.getByRole('button').querySelector('img')!;
    fireEvent.error(img);
    const icon = screen.getByRole('button').querySelector('.space-icon') as HTMLElement;
    expect(icon.querySelector('img')).toBeNull();
    expect(icon.textContent).toBe('R');
    expect(icon.style.background).toContain('linear-gradient');
  });

  it('marks the active tile and leaves the others plain', () => {
    renderLocalized(<RelayTile url="wss://relay.example" active onClick={() => {}} />);
    expect(screen.getByRole('button')).toHaveClass('space active');
  });
});

describe('RelayTile background unread badge', () => {
  it('shows the count for a relay you are not on, capped at 99+', () => {
    unread.count = 150;
    renderLocalized(<RelayTile url="wss://relay.example/" active={false} onClick={() => {}} />);
    const badge = screen.getByTestId('relay-background-unread');
    expect(badge.textContent).toBe('99+');
    expect(badge).toHaveAttribute('aria-label', '150 unread mentions or replies');
    expect(unread.keys).toContain('wss://relay.example');
  });

  it('shows the exact count under 100', () => {
    unread.count = 7;
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} />);
    expect(screen.getByTestId('relay-background-unread').textContent).toBe('7');
  });

  it('never badges the active relay (its pings are in the bell)', () => {
    unread.count = 5;
    renderLocalized(<RelayTile url="wss://relay.example" active onClick={() => {}} />);
    expect(screen.queryByTestId('relay-background-unread')).toBeNull();
    expect(unread.keys.every((k) => k === null)).toBe(true);
  });
});

describe('RelayTile long-press payload', () => {
  it('hands over the url, the label and the icon', async () => {
    relayInfo.fetch.mockResolvedValue({ name: 'Example Relay' });
    const onLongPress = vi.fn();
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} onLongPress={onLongPress} />);
    await flush();
    fireEvent.contextMenu(screen.getByRole('button'));
    expect(onLongPress).toHaveBeenCalledWith({
      url: 'wss://relay.example',
      label: 'Example Relay',
      iconUrl: 'https://favicon/wss://relay.example',
    });
  });

  it('hands over no icon once the favicon failed', () => {
    const onLongPress = vi.fn();
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={() => {}} onLongPress={onLongPress} />);
    fireEvent.error(screen.getByRole('button').querySelector('img')!);
    fireEvent.contextMenu(screen.getByRole('button'));
    expect(onLongPress).toHaveBeenCalledWith({ url: 'wss://relay.example', label: 'relay.example', iconUrl: null });
  });

  it('without a long-press handler, a held touch is still a tap and the native menu stays', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={onClick} />);
    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(800);
    fireEvent.touchEnd(tile);
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tile.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
  });

  it('a click after a long press is swallowed once, the next one goes through', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    renderLocalized(<RelayTile url="wss://relay.example" active={false} onClick={onClick} onLongPress={() => {}} />);
    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(600);
    fireEvent.click(tile);
    expect(onClick).not.toHaveBeenCalled();
    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('MobileServerRail', () => {
  it('names the rail and passes the long-press handler to every tile', () => {
    const onLongPress = vi.fn();
    renderLocalized(
      <MobileServerRail relays={['wss://relay.one', 'wss://relay.two']} activeRelay={null}
        onSelectRelay={() => {}} onAddRelay={() => {}} onLongPress={onLongPress} />,
    );
    expect(screen.getByTestId('mobile-server-rail')).toHaveAttribute('aria-label', 'Servers');
    fireEvent.contextMenu(screen.getByRole('button', { name: /relay\.two/i }));
    expect(onLongPress).toHaveBeenCalledWith(expect.objectContaining({ url: 'wss://relay.two' }));
    const tiles = screen.getAllByRole('button').filter((b) => b.className.includes('active'));
    expect(tiles).toHaveLength(0);
  });
});

describe('MobileServerBanner fallbacks', () => {
  const noop = () => {};

  it('without images: the plain fallback banner and the host letter on a gradient', () => {
    renderLocalized(
      <MobileServerBanner label="Relay" relayUrl="wss://relay.example" onSearch={noop} onCreateChannel={noop} onOpenMenu={noop} />,
    );
    const banner = screen.getByTestId('mobile-server-banner');
    expect(banner.querySelector('.server-banner-img')).toBeNull();
    expect(banner.querySelector('.server-banner-fallback')).not.toBeNull();
    const icon = banner.querySelector('.server-banner-icon') as HTMLElement;
    expect(icon.textContent).toBe('R');
    expect(icon.style.background).toContain('linear-gradient');
  });

  it('links the host to the relay website', () => {
    renderLocalized(
      <MobileServerBanner label="Relay" relayUrl="wss://relay.example/" onSearch={noop} onCreateChannel={noop} onOpenMenu={noop} />,
    );
    const link = screen.getByTestId('mobile-relay-website');
    expect(link).toHaveAttribute('href', 'https://relay.example');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.textContent).toBe('relay.example');
  });

  it('shows the host as text when it has no website', () => {
    renderLocalized(
      <MobileServerBanner label="Relay" relayUrl="relay.example" onSearch={noop} onCreateChannel={noop} onOpenMenu={noop} />,
    );
    expect(screen.queryByTestId('mobile-relay-website')).toBeNull();
    expect(screen.getByText('relay.example').tagName).toBe('SPAN');
  });

  it('with no relay: an O, no host line, and the label seeds the gradient', () => {
    renderLocalized(
      <MobileServerBanner label="Obelisk" relayUrl={null} onSearch={noop} onCreateChannel={noop} onOpenMenu={noop} />,
    );
    const banner = screen.getByTestId('mobile-server-banner');
    expect((banner.querySelector('.server-banner-icon') as HTMLElement).textContent).toBe('O');
    expect(banner.querySelector('.server-banner-copy')!.children).toHaveLength(1);
  });

  it('hands the pill the social relays and the active relay, and its settings link opens Relays', () => {
    const seen: string[] = [];
    const listener = (e: Event) => seen.push((e as CustomEvent<{ section: string }>).detail.section);
    window.addEventListener(OPEN_SETTINGS_EVENT, listener);
    renderLocalized(
      <MobileServerBanner label="Relay" relayUrl="wss://relay.example" onSearch={noop} onCreateChannel={noop} onOpenMenu={noop} />,
    );
    expect(pill.props).toMatchObject({ activeRelay: 'wss://relay.example', indicate: 'active', compact: true });
    expect(Array.isArray(pill.props!.relays)).toBe(true);
    fireEvent.click(screen.getByTestId('pill-stub'));
    window.removeEventListener(OPEN_SETTINGS_EVENT, listener);
    expect(seen).toEqual(['relays']);
  });
});
