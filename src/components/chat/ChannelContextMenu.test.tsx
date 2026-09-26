import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '@/i18n/context';
import { ChannelActionSheet, ChannelContextMenu, channelLink } from './ChannelContextMenu';
import { MUTED_FOREVER, getChannelPref, isChannelMuted, notifyLevel, useChannelPrefsStore } from '@/store/channel-prefs';
import { NOTIFICATIONS_INITIAL, getUnreadMentionCount, useNotificationsStore } from '@/store/notifications';
import { READ_STATE_INITIAL, useReadStateStore } from '@/store/read-state';

const R = 'wss://lacrypta-relay.obelisk.ar';
const target = { relay: R, channelId: 'de8bb87545bea285', name: 'general', hasUnread: true };
const wrap = (ui: React.ReactElement) => render(<LocaleProvider initialLocale="en">{ui}</LocaleProvider>);

describe('channel menu', () => {
  beforeEach(() => {
    useChannelPrefsStore.getState().reset();
    useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
    useReadStateStore.setState({ ...READ_STATE_INITIAL });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('builds the deep link the app parses', () => {
    expect(channelLink(R, 'abc')).toBe(`${window.location.origin}/app?relay=lacrypta-relay.obelisk.ar&c=abc`);
  });

  it('Mark as read clears a stuck mention card and advances the channel cursor', () => {
    useNotificationsStore.getState().pushMention({ id: 'x'.repeat(64), relay: R, channelId: target.channelId, senderPubkey: 'p', preview: '', createdAt: 5_000 });
    expect(getUnreadMentionCount(R)).toBe(1);
    const onClose = vi.fn();
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('channel-menu-mark-read'));
    expect(getUnreadMentionCount(R)).toBe(0);
    expect(useReadStateStore.getState().groupCursors[target.channelId]).toBeGreaterThan(5_000);
    expect(onClose).toHaveBeenCalled();
  });

  it('Mark as read is greyed out when there is nothing unread', () => {
    wrap(<ChannelContextMenu target={{ ...target, hasUnread: false }} x={10} y={10} onClose={() => {}} />);
    expect((screen.getByTestId('channel-menu-mark-read') as HTMLButtonElement).disabled).toBe(true);
  });

  it('Stop following toggles, and the label flips to Follow', () => {
    const { unmount } = wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    expect(screen.getByTestId('channel-menu-follow').textContent).toMatch(/Stop following/);
    fireEvent.click(screen.getByTestId('channel-menu-follow'));
    expect(getChannelPref(R, target.channelId).unfollowed).toBe(true);
    unmount();
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    expect(screen.getByTestId('channel-menu-follow').textContent).toMatch(/Follow channel/);
  });

  it('Mute ▸ 1 hour, then the item becomes Unmute', () => {
    const { unmount } = wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-mute'));
    fireEvent.click(screen.getByTestId(`channel-menu-mute-${60 * 60_000}`));
    const until = getChannelPref(R, target.channelId).mutedUntil!;
    expect(until).toBeGreaterThan(Date.now() + 59 * 60_000);
    unmount();
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-unmute'));
    expect(isChannelMuted(getChannelPref(R, target.channelId))).toBe(false);
  });

  it('Mute ▸ until I turn it back on', () => {
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-mute'));
    fireEvent.click(screen.getByTestId(`channel-menu-mute-${MUTED_FOREVER}`));
    expect(getChannelPref(R, target.channelId).mutedUntil).toBe(MUTED_FOREVER);
  });

  it('Notification settings ▸ radio', () => {
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-notify'));
    expect(screen.getByTestId('channel-menu-notify-mentions').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByTestId('channel-menu-notify-nothing'));
    expect(notifyLevel(getChannelPref(R, target.channelId))).toBe('nothing');
  });

  it('Copy link writes the channel deep link', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-copy-link'));
    expect(writeText).toHaveBeenCalledWith(channelLink(R, target.channelId));
  });

  it('closes on Escape and on a click outside', () => {
    const onClose = vi.fn();
    wrap(<ChannelContextMenu target={target} x={10} y={10} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('mobile sheet: nested mute and notify screens', () => {
    wrap(<ChannelActionSheet target={target} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-notify'));
    fireEvent.click(screen.getByTestId('channel-menu-notify-all'));
    expect(notifyLevel(getChannelPref(R, target.channelId))).toBe('all');
  });

  it('mobile sheet: mute for 15 minutes', () => {
    wrap(<ChannelActionSheet target={target} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('channel-menu-mute'));
    fireEvent.click(screen.getByTestId(`channel-menu-mute-${15 * 60_000}`));
    expect(isChannelMuted(getChannelPref(R, target.channelId))).toBe(true);
  });
});
