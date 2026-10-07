import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '@tests/support/intl';

vi.mock('@/hooks/preferences/usePreferences', () => ({
  usePreferences: () => ({ socialRelays: ['wss://relay.example'] }),
}));

import ProfileMenu from '@/components/social/profile/ProfileMenu';
import { useModerationStore } from '@/store/moderation';
import { useToastStore } from '@/store/feedback/toast';
import { waitFor } from '@testing-library/react';

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

  it('closes itself, then lets the host close, before composing a zap', () => {
    const order: string[] = [];
    const onZap = vi.fn(() => order.push('zap'));
    const onBeforeAction = vi.fn(() => order.push('before'));
    renderLocalized(<ProfileMenu pubkey={PUBKEY} displayName="Ana" onZap={onZap} onBeforeAction={onBeforeAction} />);
    fireEvent.click(screen.getByTestId('profile-more-button'));
    fireEvent.click(screen.getByTestId('profile-menu-zap'));
    expect(order).toEqual(['before', 'zap']);
    expect(screen.queryByTestId('profile-more-menu')).not.toBeInTheDocument();
  });

  it('copies the link when there is no share sheet, says so, and closes', async () => {
    useToastStore.getState().clearToasts();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share: undefined, clipboard: { writeText } });
    open();
    fireEvent.click(screen.getByTestId('profile-menu-share'));
    await waitFor(() => expect(screen.queryByTestId('profile-more-menu')).not.toBeInTheDocument());
    expect(writeText.mock.calls[0][0]).toMatch(/\/p\//);
    expect(useToastStore.getState().toasts.at(-1)).toMatchObject({ body: 'Ana' });
  });

  it('stays quiet when the share sheet is dismissed', async () => {
    useToastStore.getState().clearToasts();
    Object.assign(navigator, { share: vi.fn().mockRejectedValue(new Error('AbortError')) });
    open();
    fireEvent.click(screen.getByTestId('profile-menu-share'));
    await waitFor(() => expect(screen.queryByTestId('profile-more-menu')).not.toBeInTheDocument());
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('closes after a copy and after a mute, and offers to undo the mute', () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    open();
    fireEvent.click(screen.getByTestId('profile-menu-copy-hex'));
    expect(screen.queryByTestId('profile-more-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('profile-more-button'));
    fireEvent.click(screen.getByTestId('profile-menu-mute'));
    expect(screen.queryByTestId('profile-more-menu')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('profile-more-button'));
    expect(screen.getByTestId('profile-menu-mute')).toHaveTextContent(/unmute/i);
  });
});
