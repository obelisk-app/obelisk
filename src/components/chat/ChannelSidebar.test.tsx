import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ChannelSidebar from './ChannelSidebar';
import { useChatStore } from '@/store/chat';

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock auth store for UserPanel
vi.mock('@/store/auth', () => ({
  useAuthStore: vi.fn(() => ({
    profile: { pubkey: 'test', npub: 'npub1test', name: 'Test User', displayName: 'Test User' },
    logout: vi.fn(),
  })),
}));

describe('ChannelSidebar', () => {
  beforeEach(() => {
    useChatStore.setState(useChatStore.getInitialState());
  });

  it('renders skeleton while loading', () => {
    useChatStore.setState({ isLoadingChannels: true });
    const { container } = render(<ChannelSidebar />);
    expect(container.querySelectorAll('.lc-skeleton').length).toBeGreaterThan(0);
  });

  it('renders server name and channels when loaded', () => {
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Obelisk', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'chat-general', emoji: '💬', type: 'text', position: 0, categoryId: null },
      ],
      categories: [
        {
          id: 'cat1', name: 'OFICIAL', position: 0,
          channels: [
            { id: 'ch2', name: 'anuncios', emoji: '📢', type: 'text', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
    });

    render(<ChannelSidebar />);
    expect(screen.getByText('Obelisk')).toBeInTheDocument();
    expect(screen.getByText('chat-general')).toBeInTheDocument();
    expect(screen.getByText(/OFICIAL/)).toBeInTheDocument();
    expect(screen.getByText('anuncios')).toBeInTheDocument();
  });

  it('renders user panel at bottom', () => {
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [],
    });

    render(<ChannelSidebar />);
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('highlights active channel', () => {
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null },
        { id: 'ch2', name: 'random', emoji: null, type: 'text', position: 1, categoryId: null },
      ],
      categories: [],
      activeChannelId: 'ch1',
    });

    render(<ChannelSidebar />);
    const generalBtn = screen.getByText('general').closest('button');
    expect(generalBtn?.className).toContain('bg-lc-border');
  });

  it('collapses category on click', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [
        {
          id: 'cat1', name: 'OFICIAL', position: 0,
          channels: [
            { id: 'ch1', name: 'anuncios', emoji: null, type: 'text', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
    });

    render(<ChannelSidebar />);
    expect(screen.getByText('anuncios')).toBeInTheDocument();

    const categoryBtn = screen.getByText(/OFICIAL/).closest('button')!;
    await user.click(categoryBtn);
    expect(screen.queryByText('anuncios')).not.toBeInTheDocument();
  });

  it('calls setActiveChannel when clicking a channel', async () => {
    const user = userEvent.setup();
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null },
      ],
      categories: [],
      activeChannelId: null,
    });

    render(<ChannelSidebar />);
    await user.click(screen.getByText('general'));
    expect(useChatStore.getState().activeChannelId).toBe('ch1');
  });

  it('calls onChannelSelect when clicking a pinned channel', async () => {
    const user = userEvent.setup();
    const onChannelSelect = vi.fn();
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null },
      ],
      categories: [],
      activeChannelId: null,
    });

    render(<ChannelSidebar onChannelSelect={onChannelSelect} />);
    await user.click(screen.getByText('general'));
    expect(onChannelSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onChannelSelect when clicking a category channel', async () => {
    const user = userEvent.setup();
    const onChannelSelect = vi.fn();
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [
        {
          id: 'cat1', name: 'INFO', position: 0,
          channels: [
            { id: 'ch2', name: 'news', emoji: null, type: 'text', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
      activeChannelId: null,
    });

    render(<ChannelSidebar onChannelSelect={onChannelSelect} />);
    await user.click(screen.getByText('news'));
    expect(onChannelSelect).toHaveBeenCalledTimes(1);
  });
});
