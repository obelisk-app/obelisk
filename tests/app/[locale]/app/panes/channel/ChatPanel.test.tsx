/**
 * The desktop channel pane: which body a channel kind gets (text, a
 * publication's threads, a voice room with its docked chat), the reply
 * target, the members column, the new-game flow and the settings modal.
 * The heavy children are stubbed; each has its own tests.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBridge } from '@tests/support/fake-bridge';
import { renderWithBridge } from '@tests/support/render-with-bridge';
import { BRIDGE_MOCK_PUBKEY, BRIDGE_MOCK_RELAY, groupFixture, messageFixture } from '@tests/support/mocks/nostr-bridge';
import { normalizeRelayUrl } from '@/utils/relay-url/normalize';
import { useVoiceStore } from '@/store/voice';
import type { JsMessage } from '@/services/nostr-bridge';

const stubs = vi.hoisted(() => ({ pickFiles: null as null | ((files: File[]) => void), zaps: new Map() }));

vi.mock('@/components/voice/room/LazyVoiceRoom', () => ({
  default: ({ channelName, isChatOpen, onToggleChat, chatSlot }: {
    channelName?: string; isChatOpen: boolean; onToggleChat: () => void; chatSlot: React.ReactNode;
  }) => (
    <div data-testid="voice-room" data-name={channelName}>
      <button type="button" onClick={onToggleChat}>toggle chat</button>
      {isChatOpen ? chatSlot : null}
    </div>
  ),
}));
vi.mock('@/app/[locale]/app/mounts/lazy-mounts', () => ({
  LazyNewGameModal: ({ channelId, onClose, onPostMarker }: { channelId: string; onClose: () => void; onPostMarker: (m: string) => void }) => (
    <div data-testid="new-game" data-channel={channelId}>
      <button type="button" onClick={() => onPostMarker('MARKER')}>post marker</button>
      <button type="button" onClick={onClose}>close game</button>
    </div>
  ),
}));
vi.mock('@/components/chat/forum/ForumView', () => ({
  default: ({ channelName, onSelectThread }: { channelName?: string; onSelectThread: (id: string) => void }) => (
    <div data-testid="forum-view" data-name={channelName}>
      <button type="button" onClick={() => onSelectThread('t1')}>open thread</button>
    </div>
  ),
}));
vi.mock('@/app/[locale]/app/modals/channel-settings/ChannelSettingsModal', () => ({
  ChannelSettingsModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="channel-settings"><button type="button" onClick={onClose}>close settings</button></div>
  ),
}));
vi.mock('@/app/[locale]/app/panes/channel/MembersPanel', () => ({
  MembersPanel: ({ groupId }: { groupId: string }) => <div data-testid="members-panel" data-group={groupId} />,
}));
vi.mock('@/app/[locale]/app/panes/message/MessageRow', () => ({
  MessageRow: ({ msg, onReply }: { msg: JsMessage; onReply: (m: JsMessage) => void }) => (
    <div data-testid={`row-${msg.id}`}><button type="button" onClick={() => onReply(msg)}>reply {msg.id}</button></div>
  ),
}));
vi.mock('@/app/[locale]/app/panes/channel/ChatComposer', () => ({
  ChatComposer: forwardRef<{ pickFiles: (f: File[]) => void }, { groupId: string; replyingTo: JsMessage | null; onOpenNewGame: () => void }>(
    function ComposerStub({ groupId, replyingTo, onOpenNewGame }, ref) {
      useImperativeHandle(ref, () => ({ pickFiles: (files: File[]) => stubs.pickFiles?.(files) }), []);
      return (
        <div data-testid="composer" data-group={groupId} data-replying={replyingTo?.id ?? ''}>
          <button type="button" onClick={onOpenNewGame}>new game</button>
        </div>
      );
    },
  ),
}));
vi.mock('@/hooks/chat/zaps/useMessageZaps', () => ({ useMessageZaps: () => stubs.zaps }));
vi.mock('@/hooks/games/channel/useChannelGames', () => ({ useChannelGamesSubscription: () => {} }));
// The relay's NIP-11 document; jsdom must not fetch it for real.
vi.mock('@/services/relay/relay-info', async (orig) => ({
  ...(await orig<typeof import('@/services/relay/relay-info')>()),
  fetchRelayInfo: vi.fn().mockResolvedValue(null),
}));

import { ChatLayout } from '@/app/[locale]/app/panes/channel/ChatPanel';

const text = groupFixture({ id: 'g', name: 'general' });
const other = groupFixture({ id: 'g2', name: 'random' });
const forum = groupFixture({ id: 'f', name: 'pubs', kind: 'forum' });
const voice = groupFixture({ id: 'v', name: 'hangout', kind: 'voice' });
const messages = { g: [messageFixture({ id: 'm1', createdAt: 1 }), messageFixture({ id: 'm2', createdAt: 2 })] };

function setup({ groupId = 'g', showMembers = false, seed = {}, methods = {} } = {}) {
  const onSelectGroup = vi.fn();
  const bridge = fakeBridge(
    { groups: [text, other, forum, voice], messagesByGroup: messages, ...seed },
    methods,
  );
  const props = { showMembers, onToggleMembers: vi.fn(), pendingMessageId: null, onConsumePendingMessageId: vi.fn(), onSelectGroup };
  const view = renderWithBridge(<ChatLayout groupId={groupId} {...props} />, bridge);
  const rerenderWith = (id: string) => view.rerender(<ChatLayout groupId={id} {...props} />);
  return { ...view, onSelectGroup, rerenderWith, bridge };
}

beforeEach(() => {
  useVoiceStore.setState({ isVoiceChatOpen: false });
  stubs.pickFiles = null;
});

describe('ChatLayout: a text channel', () => {
  it('shows the messages and the composer, and no voice room or publication', () => {
    setup();
    expect(screen.getByTestId('row-m1')).toBeInTheDocument();
    expect(screen.getByTestId('row-m2')).toBeInTheDocument();
    expect(screen.getByTestId('composer').dataset.group).toBe('g');
    expect(screen.queryByTestId('voice-room')).toBeNull();
    expect(screen.queryByTestId('forum-view')).toBeNull();
    expect(screen.queryByTestId('messages-gated-by-auth')).toBeNull();
  });

  it('shows the members column only when asked', () => {
    setup({ showMembers: true });
    expect(screen.getByTestId('members-panel').dataset.group).toBe('g');
  });

  it('hides the members column when not asked', () => {
    setup();
    expect(screen.queryByTestId('members-panel')).toBeNull();
  });

  it('a reply sets the composer target, and switching channel drops it', () => {
    const { rerenderWith } = setup();
    fireEvent.click(screen.getByText('reply m2'));
    expect(screen.getByTestId('composer').dataset.replying).toBe('m2');
    rerenderWith('g2');
    expect(screen.getByTestId('composer').dataset.replying).toBe('');
  });

  it('marks the list as gated while the relay has not let the user in', () => {
    setup({ seed: { relayAccess: { [normalizeRelayUrl(BRIDGE_MOCK_RELAY)]: 'auth-required' } } });
    expect(screen.getByTestId('messages-gated-by-auth')).toBeInTheDocument();
    expect(screen.getByTestId('row-m1')).toBeInTheDocument();
  });

  it('opens the new-game dialog and posts its table card to the channel', async () => {
    const sendMessage = vi.fn(async () => {});
    setup({ methods: { sendMessage } });
    fireEvent.click(screen.getByText('new game'));
    expect(screen.getByTestId('new-game').dataset.channel).toBe('g');
    fireEvent.click(screen.getByText('post marker'));
    await waitFor(() => expect(sendMessage).toHaveBeenCalledWith('g', 'MARKER', null, []));
    fireEvent.click(screen.getByText('close game'));
    expect(screen.queryByTestId('new-game')).toBeNull();
  });

  it('logs, and does not throw, when posting the table card fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup({ methods: { sendMessage: vi.fn(async () => { throw new Error('nope'); }) } });
    fireEvent.click(screen.getByText('new game'));
    fireEvent.click(screen.getByText('post marker'));
    await waitFor(() => expect(error).toHaveBeenCalledWith('[games] posting the table card failed', expect.any(Error)));
    error.mockRestore();
  });

  it('an admin opens the channel settings from the header', () => {
    setup({ seed: { adminsByGroup: { g: [BRIDGE_MOCK_PUBKEY] } }, methods: { ensureUserMetadata: vi.fn(async () => {}) } });
    fireEvent.click(screen.getByRole('button', { name: 'Channel settings' }));
    expect(screen.getByTestId('channel-settings')).toBeInTheDocument();
    fireEvent.click(screen.getByText('close settings'));
    expect(screen.queryByTestId('channel-settings')).toBeNull();
  });

  it('hands dropped files to the composer', () => {
    const picked = vi.fn();
    stubs.pickFiles = picked;
    setup();
    const file = new File(['x'], 'a.png', { type: 'image/png' });
    const zone = screen.getByTestId('composer').closest('.flex.min-h-0.flex-1.flex-col.overflow-hidden')!;
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } });
    expect(picked).toHaveBeenCalledWith([file]);
  });
});

describe('ChatLayout: a publication', () => {
  it('shows its threads instead of a message list, and opens a thread', () => {
    const { onSelectGroup } = setup({ groupId: 'f' });
    expect(screen.getByTestId('forum-view').dataset.name).toBe('pubs');
    expect(screen.queryByTestId('composer')).toBeNull();
    fireEvent.click(screen.getByText('open thread'));
    expect(onSelectGroup).toHaveBeenCalledWith('t1');
  });
});

describe('ChatLayout: a voice channel', () => {
  it('shows the room, and docks the chat beside it while it is open', () => {
    setup({ groupId: 'v' });
    expect(screen.getByTestId('voice-room').dataset.name).toBe('hangout');
    expect(screen.queryByTestId('composer')).toBeNull();
    fireEvent.click(screen.getByText('toggle chat'));
    expect(useVoiceStore.getState().isVoiceChatOpen).toBe(true);
    expect(screen.getByTestId('composer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat' }));
    expect(useVoiceStore.getState().isVoiceChatOpen).toBe(false);
    expect(screen.queryByTestId('composer')).toBeNull();
  });

  it('opening the docked chat sizes it to half the voice area, within its bounds', () => {
    // jsdom lays nothing out: the area measures 0 wide, so half of it clamps
    // to the rail's 280px minimum. Before the area was measured at all the
    // rail kept its saved or default 400px on every open.
    localStorage.removeItem('obelisk:voice-chat-width');
    setup({ groupId: 'v' });
    fireEvent.click(screen.getByText('toggle chat'));
    expect(document.getElementById('voice-chat-rail')!.style.width).toBe('280px');
    expect(localStorage.getItem('obelisk:voice-chat-width')).toBe('280');
  });

  it('never shows the members column', () => {
    setup({ groupId: 'v', showMembers: true });
    expect(screen.queryByTestId('members-panel')).toBeNull();
  });
});

describe('ChatLayout: a channel the relay does not show', () => {
  it('still renders the pane and the composer', async () => {
    setup({ groupId: 'unknown' });
    await act(async () => {});
    expect(screen.getByTestId('composer').dataset.group).toBe('unknown');
  });
});
