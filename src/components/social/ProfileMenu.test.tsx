import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/lib/preferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://relay.example'] }),
}));

import ProfileMenu from './ProfileMenu';
import { useModerationStore } from '@/store/moderation';

const PUBKEY = 'a'.repeat(64);

const renderLocalized = (ui: React.ReactElement) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

const open = () => {
  renderLocalized(<ProfileMenu pubkey={PUBKEY} displayName="Ana" />);
  fireEvent.click(screen.getByTestId('profile-more-button'));
};

describe('ProfileMenu', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useModerationStore.setState({ mutedPubkeys: [], blockedPubkeys: [] });
  });

  it('hands over the link people actually paste, not just the npub', async () => {
    // The old menu could only copy `npub1…`, which opens nothing for someone
    // who has never heard of Nostr. This is a page with a name on it.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    open();
    fireEvent.click(screen.getByTestId('profile-menu-copy-link'));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/\/p\/nprofile1|\/p\/npub1/);
  });

  it('still offers both identifiers', () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    open();
    fireEvent.click(screen.getByTestId('profile-menu-copy-npub'));
    expect(writeText.mock.calls[0][0]).toMatch(/^npub1/);

    fireEvent.click(screen.getByTestId('profile-more-button'));
    fireEvent.click(screen.getByTestId('profile-menu-copy-hex'));
    expect(writeText.mock.calls[1][0]).toBe(PUBKEY);
  });

  it('opens the profile page in a tab', () => {
    open();
    expect(screen.getByTestId('profile-menu-open-page'))
      .toHaveAttribute('href', expect.stringContaining('/p/'));
  });

  it('mutes and blocks from the same menu', () => {
    open();
    fireEvent.click(screen.getByTestId('profile-menu-mute'));
    expect(useModerationStore.getState().mutedPubkeys).toContain(PUBKEY);

    fireEvent.click(screen.getByTestId('profile-more-button'));
    fireEvent.click(screen.getByTestId('profile-menu-block'));
    expect(useModerationStore.getState().blockedPubkeys).toContain(PUBKEY);
  });

  it('offers no moderation on your own profile', () => {
    renderLocalized(<ProfileMenu pubkey={PUBKEY} displayName="Me" canModerate={false} />);
    fireEvent.click(screen.getByTestId('profile-more-button'));

    expect(screen.queryByTestId('profile-menu-mute')).not.toBeInTheDocument();
    expect(screen.queryByTestId('profile-menu-block')).not.toBeInTheDocument();
    // …but the sharing half is still there: it's your profile to share.
    expect(screen.getByTestId('profile-menu-copy-link')).toBeInTheDocument();
  });

  it('only offers a zap where one can be composed', () => {
    const onZap = vi.fn();
    renderLocalized(<ProfileMenu pubkey={PUBKEY} displayName="Ana" onZap={onZap} />);
    fireEvent.click(screen.getByTestId('profile-more-button'));
    fireEvent.click(screen.getByTestId('profile-menu-zap'));
    expect(onZap).toHaveBeenCalled();
  });

  it('shares the URL rather than the bare npub', async () => {
    // Sharing an npub to a group chat pastes an opaque string. Sharing the
    // URL pastes a link that previews with a name and a picture.
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });

    open();
    fireEvent.click(screen.getByTestId('profile-menu-share'));

    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining('/p/'),
    }));
  });
});
