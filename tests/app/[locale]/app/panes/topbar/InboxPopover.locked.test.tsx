/**
 * The bell while DMs are locked: a saved DM card says "New direct message"
 * with no text, the gift wraps waiting unopened are one row that opens the
 * DMs, and the text appears once the message is decrypted.
 */
import { act, fireEvent, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InboxPopover } from '@/app/[locale]/app/panes/topbar/InboxPopover';
import { useInboxStreams } from '@/hooks/app/panes/topbar/useTopBarPopovers';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';
import type { DmLockState } from '@/services/nostr-bridge';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';

const SENDER = 'b'.repeat(64);

function Bell({ onOpenDms, onDmClick }: { onOpenDms: () => void; onDmClick: () => void }) {
  const inbox = useInboxStreams('wss://relay.test');
  return (
    <>
      <span data-testid="badge">{inbox.unreadInboxCount}</span>
      <InboxPopover inbox={inbox} onMentionClick={vi.fn()} onDmClick={onDmClick} onOpenDms={onOpenDms} />
    </>
  );
}

function mount(lock: DmLockState) {
  const onOpenDms = vi.fn();
  const bridge = fakeBridge({ dmLock: lock });
  renderWithBridge(<Bell onOpenDms={onOpenDms} onDmClick={vi.fn()} />, bridge);
  fireEvent.click(screen.getByTestId('notif-tab-dms'));
  return { bridge, onOpenDms };
}

beforeEach(() => {
  useReadStateStore.setState({ inboxLastReadAt: 1_000 });
  useNotificationsStore.setState({ dmNotifications: [{ id: 'card', senderPubkey: SENDER, createdAt: 5_000 }] });
});

describe('the bell while DMs are locked', () => {
  it('shows a saved card without text and one row for the unopened wraps newer than the cursor', () => {
    const { onOpenDms } = mount({ status: 'locked', unopened: [500, 6_000, 7_000] });
    expect(screen.getByText('New direct message')).toBeInTheDocument();
    expect(screen.getByTestId('notif-dm-locked')).toHaveTextContent('2 new direct messages');
    expect(screen.getByTestId('badge')).toHaveTextContent('3');
    fireEvent.click(screen.getByTestId('notif-dm-locked'));
    expect(onOpenDms).toHaveBeenCalledTimes(1);
  });

  it('shows the text once the message is decrypted, and no locked row once DMs are open', () => {
    const { bridge } = mount({ status: 'locked', unopened: [6_000] });
    act(() => {
      useNotificationsStore.getState().fillDmPreview('card', 'see you at noon');
      bridge.stores.dmLock.set({ status: 'unlocked', unopened: [] });
    });
    expect(screen.getByText('see you at noon')).toBeInTheDocument();
    expect(screen.queryByText('New direct message')).toBeNull();
    expect(screen.queryByTestId('notif-dm-locked')).toBeNull();
  });

  it('is not "caught up" when only the locked row is there', () => {
    useNotificationsStore.setState({ dmNotifications: [] });
    mount({ status: 'locked', unopened: [6_000] });
    expect(screen.getByTestId('notif-dm-locked')).toHaveTextContent('1 new direct message');
    expect(screen.getByTestId('notif-clear')).toBeInTheDocument();
  });
});
