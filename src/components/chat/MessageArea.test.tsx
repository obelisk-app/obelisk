import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import MessageArea from './MessageArea';
import { useChatStore } from '@/store/chat';

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
    profileCache.clear();
  });

  it('shows "Select a channel" when no channel is active', () => {
    useChatStore.setState({ activeChannelId: null });
    render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByText('Select a channel')).toBeInTheDocument();
  });

  it('shows skeleton while loading messages', () => {
    useChatStore.setState({
      activeChannelId: 'ch1',
      isLoadingMessages: true,
      pinnedChannels: [{ id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null }],
      categories: [],
    });
    const { container } = render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
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
    render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
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

    render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
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

    const { container } = render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    const img = container.querySelector('img[src="https://example.com/photo.jpg"]');
    expect(img).toBeInTheDocument();
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

    render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.getByTestId('load-older-btn')).toBeInTheDocument();
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

    render(<MessageArea profileCache={profileCache} onEdit={vi.fn()} onDelete={vi.fn()} onToggleReaction={vi.fn()} />);
    expect(screen.queryByTestId('load-older-btn')).not.toBeInTheDocument();
  });
});
