import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_RELAY } from '@tests/support/mocks/nostr-bridge';
import { useNotificationsStore } from '@/store/notifications';
import { useReadStateStore } from '@/store/read-state';
import { InboxScreen } from '@/app/[locale]/app/mobile/screens/inbox/InboxScreen';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

const SENDER = 'b'.repeat(64);
const PEER = 'c'.repeat(64);

beforeEach(() => {
  useNotificationsStore.setState({
    mentionsByRelay: {
      [BRIDGE_MOCK_RELAY]: [
        { id: 'n1', relay: BRIDGE_MOCK_RELAY, channelId: 'v1', senderPubkey: SENDER, preview: 'hey @you', createdAt: 5_000 },
        { id: 'n2', relay: BRIDGE_MOCK_RELAY, channelId: 'gone', senderPubkey: SENDER, preview: 'replying', createdAt: 4_000, reason: 'reply' },
      ],
    },
    dmNotifications: [{ id: 'd1', senderPubkey: PEER, createdAt: 6_000, preview: 'psst' }],
  } as never);
});

function mount() {
  const props = { go: vi.fn(), selectGroup: vi.fn(), selectPeer: vi.fn() };
  renderWithBridge(
    <InboxScreen {...props} />,
    fakeBridge({
      groups: [group({ id: 'v1', kind: 'voice' })],
      messagesByGroup: { v1: [message({ id: 'x' })], t1: [] },
      dmsByPeer: { [PEER]: [] },
    }),
  );
  return props;
}

describe('InboxScreen (phone)', () => {
  it('lists the mentions and jumps to their channel with its kind, text when unknown', () => {
    const { selectGroup } = mount();
    const cards = document.querySelectorAll('.mention-card');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveClass('urgent');
    fireEvent.click(cards[0]);
    expect(selectGroup).toHaveBeenLastCalledWith('v1', 'voice');
    fireEvent.click(cards[1]);
    expect(selectGroup).toHaveBeenLastCalledWith('gone', 'text');
  });

  it('switches to DMs and opens the conversation', () => {
    const { selectPeer } = mount();
    fireEvent.click(screen.getByTestId('inbox-tab-dms'));
    expect(screen.getByTestId('inbox-tab-dms')).toHaveClass('active');
    const cards = document.querySelectorAll('.mention-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveTextContent('psst');
    fireEvent.click(cards[0]);
    expect(selectPeer).toHaveBeenCalledWith(PEER);
  });

  it('marks only the visible stream read', () => {
    const markMentionsRead = vi.fn();
    const markAllAsRead = vi.fn();
    useNotificationsStore.setState({ markMentionsRead } as never);
    useReadStateStore.setState({ markAllAsRead } as never);
    mount();
    fireEvent.click(document.querySelector('.mark-all-read')!);
    expect(markMentionsRead).toHaveBeenCalledWith(BRIDGE_MOCK_RELAY);
    expect(markAllAsRead).toHaveBeenLastCalledWith([], ['v1', 't1']);
    fireEvent.click(screen.getByTestId('inbox-tab-dms'));
    fireEvent.click(document.querySelector('.mark-all-read')!);
    expect(markAllAsRead).toHaveBeenLastCalledWith([PEER], []);
    expect(markMentionsRead).toHaveBeenCalledTimes(1);
  });

  it('says everything is read when the stream is empty', () => {
    useNotificationsStore.setState({ mentionsByRelay: {} } as never);
    mount();
    expect(document.querySelector('.empty-state')).not.toBeNull();
  });
});
