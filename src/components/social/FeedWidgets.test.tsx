import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LocaleProvider } from '@/i18n/context';
import { DEFAULT_FEED_WIDGETS } from '@/lib/social/widgets';

const prefs: { feedWidgets: string[]; socialRelays: string[] } = {
  feedWidgets: [...DEFAULT_FEED_WIDGETS],
  socialRelays: [],
};
const setPreference = vi.fn((key: string, value: unknown) => {
  if (key === 'feedWidgets') prefs.feedWidgets = value as string[];
});

vi.mock('@/lib/preferences', () => ({
  usePreferences: () => prefs,
  setPreference: (key: string, value: unknown) => setPreference(key, value),
}));

vi.mock('@/lib/nostr-bridge', () => ({
  useMyPubkey: () => null,
  useMyFollows: () => [],
  useMyContactList: () => null,
  useMyContactListReady: () => true,
}));

const NO_STATUSES = Object.freeze({});
vi.mock('@/lib/social/relay-status', () => ({
  getRelayStatuses: () => NO_STATUSES,
  subscribeRelayStatus: () => () => {},
  probeRelay: vi.fn(),
  watchRelays: vi.fn(),
}));

vi.mock('@/lib/social/useInterests', () => ({
  useInterests: () => ({ tags: [], isFollowing: () => false, toggle: vi.fn(), ready: true }),
}));

import FeedWidgets from './FeedWidgets';

const renderColumn = () => render(
  <LocaleProvider initialLocale="en">
    <FeedWidgets notes={[]} />
  </LocaleProvider>,
);

describe('FeedWidgets', () => {
  beforeEach(() => {
    prefs.feedWidgets = [...DEFAULT_FEED_WIDGETS];
    setPreference.mockClear();
  });

  it('shows the two default panels', () => {
    renderColumn();
    expect(screen.getByTestId('widget-trending')).toBeTruthy();
    expect(screen.getByTestId('widget-who-to-follow')).toBeTruthy();
    expect(screen.queryByTestId('widget-relays')).toBeNull();
  });

  it('lets the reader switch a panel on', async () => {
    const user = userEvent.setup();
    renderColumn();
    await user.click(screen.getByTestId('feed-widgets-picker'));
    await user.click(
      screen.getAllByTestId('feed-widget-option').find((o) => o.dataset.widget === 'relays')!,
    );
    expect(setPreference).toHaveBeenCalledWith(
      'feedWidgets',
      expect.arrayContaining(['relays']),
    );
  });

  /**
   * With three or four widgets the column outgrew the viewport, and because
   * it is `sticky top-0` the overflow hung off the bottom — the picker that
   * had just added the widget was itself the thing pushed out of reach.
   */
  it('keeps the picker reachable no matter how many panels are on', () => {
    prefs.feedWidgets = ['trending', 'who-to-follow', 'followed-tags', 'relays'];
    renderColumn();
    const picker = screen.getByTestId('feed-widgets-picker');
    // Stuck to the bottom of the scrolling column rather than trailing it.
    expect(picker.parentElement?.className).toContain('sticky');
    expect(picker.parentElement?.className).toContain('bottom-0');
  });

  it('renders every panel the preference names', () => {
    prefs.feedWidgets = ['trending', 'who-to-follow', 'followed-tags', 'relays'];
    renderColumn();
    for (const id of ['trending', 'who-to-follow', 'followed-tags', 'relays']) {
      expect(screen.getByTestId(`widget-${id}`)).toBeTruthy();
    }
  });

  /** An empty column reads as a bug, so the last panel can't be removed. */
  it('locks the last remaining panel', async () => {
    const user = userEvent.setup();
    prefs.feedWidgets = ['trending'];
    renderColumn();
    await user.click(screen.getByTestId('feed-widgets-picker'));
    const option = screen.getAllByTestId('feed-widget-option')
      .find((o) => o.dataset.widget === 'trending')!;
    expect((option as HTMLButtonElement).disabled).toBe(true);
  });
});
