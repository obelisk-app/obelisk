import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MessageArea from './MessageArea';
import { useChatStore } from '@/store/chat';
import { useNotificationStore } from '@/store/notification';

// Mock useAuthStore
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn(() => ({
    profile: { pubkey: 'my-pubkey', name: 'Me' },
  })),
}));

// Mock nostr formatPubkey
vi.mock('@/lib/nostr', () => ({
  formatPubkey: vi.fn((pk: string) => `${pk.slice(0, 8)}...`),
}));

describe('MessageArea', () => {
  const profileCache = new Map<string, { name?: string; picture?: string }>();

  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
    useNotificationStore.setState(useNotificationStore.getInitialState());
    profileCache.clear();
  });

  it('shows "Select a channel" when no channel is active', () => {
    useChatStore.setState({ activeChannelId: null });
    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });

  it('shows skeleton while loading messages', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: true,
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });
    const { container } = render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(container.querySelectorAll('.lc-skeleton').length).toBeGreaterThan(0);
  });

  it('shows empty state when no messages', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });
    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByText('No messages yet')).toBeInTheDocument();
  });

  it('renders messages with author name from cache', () => {
    profileCache.set('pk1', { name: 'Alice', picture: undefined });
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'Hello everyone!', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Hello everyone!')).toBeInTheDocument();
  });

  it('renders inline images for image URLs', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'Check this https://example.com/photo.jpg', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    const { container } = render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    const img = container.querySelector('img[src="https://example.com/photo.jpg"]');
    expect(img).toBeInTheDocument();
  });

  it('tags each rendered message with data-message-id (scroll-anchor hook for refresh restore)', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'first', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
        { id: 'm2', channelId: 'ch1', authorPubkey: 'pk1', content: 'second', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    const { container } = render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    // Each message wrapper carries data-message-id so the IntersectionObserver
    // that persists the last-seen anchor (for refresh restoration) can find
    // which message an observed element maps to.
    expect(container.querySelector('[data-message-id="m1"]')).toBeInTheDocument();
    expect(container.querySelector('[data-message-id="m2"]')).toBeInTheDocument();
  });

  it('shows Load earlier button when hasMoreMessages is true', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'msg', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
      hasMoreMessages: true,
      messageCursor: 'cursor-1',
    });

    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByTestId('load-older-btn')).toBeInTheDocument();
  });

  it('renders the "New messages" separator above the first unread (scenario 3)', () => {
    const now = Date.now();
    const messages = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      channelId: 'ch1',
      authorPubkey: 'pk1',
      content: `msg ${i}`,
      replyToId: null,
      editedAt: null,
      createdAt: new Date(now + i * 1000).toISOString(),
    }));
    // 5 unread means the separator should sit above messages[15] — the
    // first of the last 5.
    useNotificationStore.getState().setChannelUnread('ch1', 5, false);
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: messages as any,
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);

    const separator = screen.getByTestId('new-messages-separator');
    expect(separator).toBeInTheDocument();
    // Walk forward from the separator to find the next message node with
    // visible text — it should be "msg 15", the first unread.
    const text = separator.parentElement?.textContent || '';
    expect(text).toContain('New messages');
    // The messages rendered after the separator should include msg 15.
    expect(screen.getByText('msg 15')).toBeInTheDocument();
  });

  it('anchors separator at lastReadAt so own messages sent before the boundary render above (own-as-unread regression)', () => {
    // Regression guard: pre-fix, the separator was computed as
    // `messages.length - unreadCount`. Since the server excludes own
    // messages from unreadCount but the local `messages` array does not,
    // any own message among the last N slots slid under "New messages".
    //
    // Fix: anchor by server-authored `channelLastReadAt`. The separator
    // lands above the first other-authored message newer than lastRead.
    const now = Date.now();
    const lastRead = now + 2500; // my own 'b' and the 'a' arrived before
    const messages = [
      { id: 'a', channelId: 'ch1', authorPubkey: 'other', content: 'msg a', replyToId: null, editedAt: null, createdAt: new Date(now + 1000).toISOString() },
      { id: 'b', channelId: 'ch1', authorPubkey: 'my-pubkey', content: 'msg b (mine pre-read)', replyToId: null, editedAt: null, createdAt: new Date(now + 2000).toISOString() },
      { id: 'c', channelId: 'ch1', authorPubkey: 'other', content: 'msg c', replyToId: null, editedAt: null, createdAt: new Date(now + 3000).toISOString() },
      { id: 'd', channelId: 'ch1', authorPubkey: 'other', content: 'msg d', replyToId: null, editedAt: null, createdAt: new Date(now + 4000).toISOString() },
    ];
    useNotificationStore.getState().setChannelUnread('ch1', 2, false);
    useNotificationStore.setState({
      channelLastReadAt: { ch1: lastRead },
    } as any);
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: messages as any,
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    const { container } = render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);

    const separator = screen.getByTestId('new-messages-separator');
    expect(separator).toBeInTheDocument();

    // Scan the DOM in render order to locate whether each own msg is
    // above or below the separator.
    const allNodes = Array.from(container.querySelectorAll('*'));
    const separatorPos = allNodes.indexOf(separator);
    const msgBNode = screen.getByText('msg b (mine pre-read)');
    const msgCNode = screen.getByText('msg c');
    const msgBPos = allNodes.indexOf(msgBNode);
    const msgCPos = allNodes.indexOf(msgCNode);
    // Own msg 'b' (pre-read) must render BEFORE the separator.
    expect(msgBPos).toBeLessThan(separatorPos);
    // 'c' is the first unread other-authored message — at/after separator.
    expect(msgCPos).toBeGreaterThan(separatorPos);
  });

  it('does not render the separator when there are no unread', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'msg', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });
    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.queryByTestId('new-messages-separator')).not.toBeInTheDocument();
  });

  it('context menu "Copiar enlace" copies /chat?s=&c=&m= to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://obelisk.test', pathname: '/chat', search: '' },
      writable: true,
    });

    useChatStore.setState({
      activeServerId: 'srv1',
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        {
          id: 'm1',
          channelId: 'ch1',
          authorPubkey: 'pk1',
          content: 'hello',
          replyToId: null,
          editedAt: null,
          createdAt: new Date().toISOString(),
        },
      ] as any,
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });

    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);

    fireEvent.click(screen.getByTestId('menu-btn'));
    const copyBtn = screen.getByTestId('copy-message-link-btn');
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(writeText).toHaveBeenCalledWith(
      'https://obelisk.test/chat?c=general&m=m1',
    );
  });

  it('hides Load earlier button when hasMoreMessages is false', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: false,
      messages: [
        { id: 'm1', channelId: 'ch1', authorPubkey: 'pk1', content: 'msg', replyToId: null, editedAt: null, createdAt: new Date().toISOString() },
      ],
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
      hasMoreMessages: false,
    });

    render(<MessageArea profileCache={profileCache} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.queryByTestId('load-older-btn')).not.toBeInTheDocument();
  });
});
