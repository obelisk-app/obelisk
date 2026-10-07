/**
 * The desktop top bar's own behaviour: what a click on a notification does,
 * the badge, the help panel's actions and the relay name link. The panel
 * layouts are pinned in `tests/app/[locale]/app/desktop/DesktopShell.test.tsx`.
 */
import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { RelayTopBar } from '@/app/[locale]/app/panes/topbar/RelayTopBar';
import { NOTIFICATIONS_INITIAL, useNotificationsStore, type MentionNotification } from '@/store/notifications';
import { READ_STATE_INITIAL, useReadStateStore } from '@/store/read-state';
import { useHintsStore } from '@/store/hints';
import type { DmLockState } from '@/services/nostr-bridge';

// The status pill would otherwise probe relays for real from jsdom. The
// snapshot is one object: a fresh one per read loops `useSyncExternalStore`.
const statuses = vi.hoisted(() => ({}));
vi.mock('@/services/social/relay-status', () => ({
  subscribeRelayStatus: () => () => {},
  getRelayStatuses: () => statuses,
  watchRelays: vi.fn(),
  probeRelay: vi.fn(),
  relayStatusSummary: () => ({ total: 3, connected: 3, state: 'connected' }),
}));
vi.mock('@/services/relay/relay-info', () => ({
  faviconFor: () => null,
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

const RELAY = 'wss://relay.test';
const SENDER = 'b'.repeat(64);

function mention(id: string, over: Partial<MentionNotification> = {}): MentionNotification {
  return { id, relay: RELAY, channelId: 'ch1', senderPubkey: SENDER, preview: `ping ${id}`, createdAt: 10_000 + Number(id.slice(1) || 0), ...over } as MentionNotification;
}

function mount(lock: DmLockState = { status: 'unlocked', unopened: [] }) {
  const onJumpToChannel = vi.fn();
  const onJumpToDm = vi.fn();
  renderWithBridge(
    <RelayTopBar relay={RELAY} onJumpToChannel={onJumpToChannel} onJumpToDm={onJumpToDm} />,
    fakeBridge({ dmLock: lock }),
  );
  return { onJumpToChannel, onJumpToDm };
}

beforeEach(() => {
  useNotificationsStore.setState({ ...NOTIFICATIONS_INITIAL });
  useReadStateStore.setState({ ...READ_STATE_INITIAL });
});

describe('RelayTopBar notifications', () => {
  it('a mention jumps to its channel and closes the panel', () => {
    useNotificationsStore.setState({ mentionsByRelay: { [RELAY]: [mention('m1')] } });
    const { onJumpToChannel } = mount();
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByText('ping m1'));
    expect(onJumpToChannel).toHaveBeenCalledWith('ch1');
    expect(screen.queryByTestId('notif-tabs')).toBeNull();
  });

  it('a DM card opens that conversation and closes the panel', () => {
    useNotificationsStore.setState({ dmNotifications: [{ id: 'd1', senderPubkey: SENDER, createdAt: 5_000, preview: 'yo' }] });
    const { onJumpToDm } = mount();
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByTestId('notif-tab-dms'));
    fireEvent.click(screen.getByText('yo'));
    expect(onJumpToDm).toHaveBeenCalledWith(SENDER);
    expect(screen.queryByTestId('notif-tabs')).toBeNull();
  });

  it('the locked DMs row opens the DM list and closes the panel', () => {
    const { onJumpToDm } = mount({ status: 'locked', unopened: [6_000] });
    fireEvent.click(screen.getByLabelText('Notifications'));
    fireEvent.click(screen.getByTestId('notif-tab-dms'));
    fireEvent.click(screen.getByTestId('notif-dm-locked'));
    expect(onJumpToDm).toHaveBeenCalledWith(null);
    expect(screen.queryByTestId('notif-tabs')).toBeNull();
  });

  it('a second click on the bell closes the panel', () => {
    mount();
    const bell = screen.getByLabelText('Notifications');
    fireEvent.click(bell);
    expect(screen.getByTestId('notif-tabs')).toBeInTheDocument();
    fireEvent.click(bell);
    expect(screen.queryByTestId('notif-tabs')).toBeNull();
  });

  it('caps the bell badge and the tab count at 99+', () => {
    const many = Array.from({ length: 120 }, (_, i) => mention(`m${i}`));
    useNotificationsStore.setState({ mentionsByRelay: { [RELAY]: many } });
    mount();
    const bell = screen.getByLabelText('Notifications');
    expect(bell.textContent).toBe('99+');
    fireEvent.click(bell);
    expect(screen.getByTestId('notif-tab-mentions').textContent).toBe('Mentions99+');
    expect(screen.getByTestId('notif-tab-dms').textContent).toBe('DMs');
  });

  it('shows "caught up" for an empty tab', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Notifications'));
    expect(screen.getByText('No mentions on this relay.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('notif-tab-dms'));
    expect(screen.getByText('No new direct messages.')).toBeInTheDocument();
  });
});

describe('RelayTopBar help', () => {
  it('replaying the tips resets the hints and closes the panel', () => {
    const resetHints = vi.fn();
    useHintsStore.setState({ resetHints });
    mount();
    fireEvent.click(screen.getByLabelText('Help'));
    fireEvent.click(screen.getByTestId('help-popover-replay-hints'));
    expect(resetHints).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('help-popover')).toBeNull();
  });

  it('following a topic closes the panel', () => {
    mount();
    fireEvent.click(screen.getByLabelText('Help'));
    fireEvent.click(screen.getByTestId('help-popover-topic-local-data'));
    expect(screen.queryByTestId('help-popover')).toBeNull();
  });
});

describe('RelayTopBar relay name', () => {
  it('links the relay host to its website, with its initial as the icon', () => {
    mount();
    const link = screen.getByTestId('relay-topbar-name');
    expect(link.getAttribute('href')).toBe('https://relay.test');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.textContent).toBe('Rrelay.test');
  });
});
