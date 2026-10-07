import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY } from '@tests/support/mocks/nostr-bridge';
import { ChannelScreen } from '@/app/[locale]/app/mobile/screens/channel/ChannelScreen';
import { group, message } from '@tests/app/[locale]/app/mobile/mobile-fixtures';

vi.mock('@/hooks/relay/useBotCommands', () => ({ useBotCommands: () => [] }));
vi.mock('@/components/chat/message/MessageContent', () => ({
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

const OTHER = 'a'.repeat(64);

function mount(seed: Parameters<typeof fakeBridge>[0] = {}) {
  const props = { go: vi.fn(), back: vi.fn(), openMsgActions: vi.fn(), openZap: vi.fn(), openProfile: vi.fn(), openMembers: vi.fn() };
  renderWithBridge(
    <ChannelScreen groupId="g1" {...props} />,
    fakeBridge({
      groups: [group({ id: 'p1', name: 'Space' }), group({ id: 'g1', name: 'general', parent: 'p1' })],
      messagesByGroup: {
        g1: [
          message({ id: 'm1', pubkey: OTHER, content: 'first', createdAt: 1_700_000_000 }),
          message({ id: 'm2', pubkey: BRIDGE_MOCK_PUBKEY, content: 'mine', createdAt: 1_700_000_100, replyToId: 'm1' }),
        ],
      },
      ...seed,
    }, {
      fetchGroupMetadata: vi.fn().mockResolvedValue(undefined),
      subscribeFilterWatched: () => () => {},
    } as never),
  );
  return props;
}

describe('ChannelScreen (phone)', () => {
  it('heads the screen with the channel and its category, and lists the messages', () => {
    mount();
    expect(screen.getByTestId('channel-name')).toHaveTextContent('general');
    expect(screen.getByTestId('channel-category')).toHaveTextContent('Space');
    expect(document.querySelector('[data-msg-id="m1"] .msg-text')).toHaveTextContent('first');
    expect(document.querySelector('[data-msg-id="m2"] .msg-text')).toHaveTextContent('mine');
    expect(document.querySelector('.day-divider')).not.toBeNull();
  });

  it('opens the action sheet with what the person may do to each message', () => {
    const { openMsgActions } = mount();
    const more = screen.getAllByTestId('mobile-msg-more');
    fireEvent.click(more[0]);
    expect(openMsgActions).toHaveBeenLastCalledWith({ id: 'm1', pubkey: OTHER, content: 'first', groupId: 'g1', canModerate: false, canDeleteOwn: false });
    fireEvent.click(more[1]);
    expect(openMsgActions).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'm2', canDeleteOwn: true }));
  });

  it('marks an admin as able to moderate and shows the settings button that opens the sheet', () => {
    const { openMsgActions } = mount({ adminsByGroup: { g1: [BRIDGE_MOCK_PUBKEY] } });
    fireEvent.click(screen.getAllByTestId('mobile-msg-more')[0]);
    expect(openMsgActions).toHaveBeenLastCalledWith(expect.objectContaining({ canModerate: true }));
    fireEvent.click(screen.getByTestId('mobile-channel-settings-btn'));
    expect(document.querySelector('[data-screen="channel-settings"]')).not.toBeNull();
  });

  it('opens the author profile from an avatar, and search and members from the header', () => {
    const { openProfile, go, openMembers } = mount();
    fireEvent.click(document.querySelector('.msg-ava')!);
    expect(openProfile).toHaveBeenCalledWith(OTHER);
    fireEvent.click(screen.getByLabelText('Search'));
    expect(go).toHaveBeenCalledWith('search');
    fireEvent.click(screen.getByLabelText('Members'));
    expect(openMembers).toHaveBeenCalled();
  });

  it('quotes the reply parent above a reply', () => {
    mount();
    expect(document.querySelector('.msg-reply-row .msg-reply-text')?.textContent).toBe('first');
  });

  it('keeps the spinner up until the relay confirms the channel is empty', () => {
    mount({ messagesByGroup: {} });
    expect(screen.getByTestId('messages-loading')).toBeInTheDocument();
  });
});
