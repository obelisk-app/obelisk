import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: (url: string) => `https://favicon/${url}`,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/hooks/relay/branding/useRelayBranding', () => ({
  useRelayBranding: () => ({}),
}));

/**
 * `MobileServerBanner` carries the relay status pill, whose mount effect
 * (`watchRelays` -> `probeRelay`) opens the social relays through the shared
 * pool. Left unmocked, this test dialled relay.damus.io, nos.lol, primal and
 * snort for real; `tests/support/setup.ts` now refuses that. Same seam the other
 * pill hosts stub (DesktopShell, FeedWidgets, UserPanel.preferences).
 */
vi.mock('@/services/social/relay-status', () => {
  // The SAME object each call: `useSyncExternalStore` compares by identity.
  const statuses = {};
  return {
    subscribeRelayStatus: () => () => {},
    getRelayStatuses: () => statuses,
    watchRelays: vi.fn(),
    probeRelay: vi.fn(),
    relayStatusSummary: () => ({ total: 0, connected: 0, state: 'unknown' }),
  };
});

import { MobileServerRail } from '@/app/[locale]/app/mobile/rail/MobileServerRail';
import { MobileServerBanner } from '@/app/[locale]/app/mobile/rail/MobileServerBanner';
import { RelayTile } from '@/app/[locale]/app/mobile/rail/RelayTile';
import { shouldIgnoreMobileSwipeTarget } from '@/utils/shell/mobile/swipe-target';
/** Every screen in the shell reads copy from the dictionary now. */
const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);


describe('mobile swipe target guard', () => {
  it('ignores search/header chrome so a tap cannot also commit carousel navigation', () => {
    const banner = document.createElement('div');
    banner.className = 'server-banner-actions';
    const search = document.createElement('button');
    search.className = 'icon-btn';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    banner.append(search);
    search.append(svg);

    expect(shouldIgnoreMobileSwipeTarget(svg)).toBe(true);
  });

  it('keeps ordinary content eligible for horizontal swipe navigation', () => {
    const row = document.createElement('button');
    row.className = 'ch-row';
    row.textContent = 'general';

    expect(shouldIgnoreMobileSwipeTarget(row)).toBe(false);
  });

  it('ignores the mention autocomplete so tapping a name cannot seed a swipe', () => {
    // Regression: a thumb tap on a mention row drifts a few px, crossing the
    // 8px horizontal threshold in onTouchMove. The carousel would start
    // dragging and the user landed on a neighbouring screen with the mention
    // never inserted.
    const popup = document.createElement('div');
    popup.className = 'composer-mention-popup';
    const row = document.createElement('button');
    row.className = 'composer-mention-row';
    const name = document.createElement('span');
    row.append(name);
    popup.append(row);

    expect(shouldIgnoreMobileSwipeTarget(row)).toBe(true);
    expect(shouldIgnoreMobileSwipeTarget(name)).toBe(true);
  });
});

describe('RelayTile long-press', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('fires onLongPress after 500ms and suppresses the click', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    renderLocalized(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(600);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'wss://relay.example' }),
    );

    fireEvent.touchEnd(tile);
    fireEvent.click(tile);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('does not fire onLongPress on a quick tap', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    renderLocalized(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(120);
    fireEvent.touchEnd(tile);
    expect(onLongPress).not.toHaveBeenCalled();

    fireEvent.click(tile);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('cancels the timer when the touch moves (e.g. horizontal scroll drag)', () => {
    const onClick = vi.fn();
    const onLongPress = vi.fn();
    renderLocalized(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={onClick}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    fireEvent.touchStart(tile);
    vi.advanceTimersByTime(200);
    fireEvent.touchMove(tile);
    vi.advanceTimersByTime(600);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('fires onLongPress on right-click and suppresses the native menu', () => {
    const onLongPress = vi.fn();
    renderLocalized(
      <RelayTile
        url="wss://relay.example"
        active={false}
        onClick={() => {}}
        onLongPress={onLongPress}
      />,
    );

    const tile = screen.getByRole('button');
    const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    tile.dispatchEvent(evt);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe('Mobile server layout pieces', () => {
  it('renders relays in a vertical rail and normalizes the active relay URL', () => {
    const onSelectRelay = vi.fn();
    const onAddRelay = vi.fn();

    renderLocalized(
      <MobileServerRail
        relays={['wss://relay.one', 'wss://relay.two']}
        activeRelay="wss://relay.one/"
        onSelectRelay={onSelectRelay}
        onAddRelay={onAddRelay}
      />,
    );

    const rail = screen.getByTestId('mobile-server-rail');
    expect(rail.className).toContain('spaces-rail');
    expect(within(rail).getByRole('button', { name: /relay\.one/i }).className).toContain('active');

    fireEvent.click(within(rail).getByRole('button', { name: /relay\.two/i }));
    expect(onSelectRelay).toHaveBeenCalledWith('wss://relay.two');

    fireEvent.click(within(rail).getByRole('button', { name: /add relay/i }));
    expect(onAddRelay).toHaveBeenCalledTimes(1);
  });

  it('matches the active relay by URL semantics, not by lowercasing the whole string', () => {
    // The rail used to compare relays with a private `normalizeRelayUrl` that
    // lowercased everything, so `wss://relay.one/Group` and
    // `wss://relay.one/group` were "the same relay" on mobile and different
    // relays in the bridge (which keys auth state and unread counts by the
    // canonical form). Host case folds; path case is significant.
    renderLocalized(
      <MobileServerRail
        relays={['wss://Relay.One/', 'wss://relay.two/Group', 'wss://relay.two/group']}
        activeRelay="wss://relay.one"
        onSelectRelay={() => {}}
        onAddRelay={() => {}}
      />,
    );

    const rail = screen.getByTestId('mobile-server-rail');
    const tiles = within(rail).getAllByRole('button').filter((b) => b.className.includes('space') && !b.className.includes('space-add'));
    expect(tiles[0].className).toContain('active');
    expect(tiles[1].className).not.toContain('active');
    expect(tiles[2].className).not.toContain('active');
  });

  it('treats a path-case difference as a different relay, even when it is the active one', () => {
    renderLocalized(
      <MobileServerRail
        relays={['wss://relay.two/Group', 'wss://relay.two/group']}
        activeRelay="wss://relay.two/group"
        onSelectRelay={() => {}}
        onAddRelay={() => {}}
      />,
    );
    const rail = screen.getByTestId('mobile-server-rail');
    const tiles = within(rail).getAllByRole('button').filter((b) => b.className.includes('space') && !b.className.includes('space-add'));
    expect(tiles.map((tile) => tile.className.includes('active'))).toEqual([false, true]);
  });

  it('shows the active relay banner above the channel menu controls', () => {
    const onSearch = vi.fn();
    const onCreateChannel = vi.fn();
    const onOpenMenu = vi.fn();

    render(
      <LocaleProvider initialLocale="en">
        <MobileServerBanner
          label="La Crypta relay"
          relayUrl="wss://lacrypta-relay.obelisk.ar"
          iconUrl="https://img.example/icon.png"
          bannerUrl="https://img.example/banner.png"
          onSearch={onSearch}
          onCreateChannel={onCreateChannel}
          onOpenMenu={onOpenMenu}
        />
      </LocaleProvider>,
    );

    const banner = screen.getByTestId('mobile-server-banner');
    expect(banner.querySelector('.server-banner-img')).toHaveAttribute('src', 'https://img.example/banner.png');
    expect(screen.getByRole('heading', { name: 'La Crypta relay' })).toBeTruthy();
    expect(screen.getByText('lacrypta-relay.obelisk.ar')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Search this server'));
    fireEvent.click(screen.getByLabelText('Create channel'));
    fireEvent.click(screen.getByLabelText('Space menu'));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onCreateChannel).toHaveBeenCalledTimes(1);
    expect(onOpenMenu).toHaveBeenCalledTimes(1);
  });
});
