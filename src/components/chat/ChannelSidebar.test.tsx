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
vi.mock('@/store/auth', () => {
  const state = {
    profile: { pubkey: 'test', npub: 'npub1test', name: 'Test User', displayName: 'Test User' },
    logout: () => {},
  };
  return {
    useAuthStore: vi.fn((selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state,
    ),
  };
});

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

  it('context menu "Copiar enlace" on a channel copies /chat?s=&c= URL', async () => {
    const user = userEvent.setup();
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
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null },
      ],
      categories: [],
    });

    render(<ChannelSidebar />);
    await user.click(screen.getByTestId('channel-dots-ch1'));
    await user.click(screen.getByTestId('copy-channel-link-btn'));

    expect(writeText).toHaveBeenCalledWith(
      'https://obelisk.test/chat?c=general',
    );
  });

  it('right-click on a channel row opens the context menu', async () => {
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [
        { id: 'ch1', name: 'general', emoji: null, type: 'text', position: 0, categoryId: null },
      ],
      categories: [],
    });

    render(<ChannelSidebar />);
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.contextMenu(screen.getByText('general'));
    expect(screen.getByTestId('channel-context-menu')).toBeInTheDocument();
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

  it('shows a lock icon on channels the current user cannot write to', () => {
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      myRole: 'member',
      pinnedChannels: [
        { id: 'ch-open', name: 'open', emoji: null, type: 'text', position: 0, categoryId: null, writePermission: null },
        { id: 'ch-locked', name: 'locked-chan', emoji: null, type: 'text', position: 1, categoryId: null, writePermission: 'admin' },
      ],
      categories: [],
    });

    render(<ChannelSidebar />);
    const lockIcons = screen.getAllByTestId('channel-write-lock-icon');
    expect(lockIcons).toHaveLength(1);
    // The lock should be inside the "locked-chan" row
    const lockedBtn = screen.getByText('locked-chan').closest('button');
    expect(lockedBtn?.contains(lockIcons[0])).toBe(true);
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

  it('renders followed forum posts as expandable rows under their forum channel', () => {
    localStorage.setItem('obelisk:followed-posts', JSON.stringify(['post-a']));
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [
        {
          id: 'cat1', name: 'FORO', position: 0,
          channels: [
            { id: 'fch1', name: 'plaza-publica', emoji: null, type: 'forum', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
      followedPostIds: ['post-a'],
      followedPostMeta: {
        'post-a': {
          id: 'post-a',
          title: 'Only Claws',
          channelId: 'fch1',
          channelName: 'plaza-publica',
          serverId: 's1',
        },
      },
    });

    render(<ChannelSidebar />);
    expect(screen.getByTestId('channel-followed-posts-fch1')).toBeInTheDocument();
    expect(screen.getByText('Only Claws')).toBeInTheDocument();
  });

  it('does not render followed posts from other servers', () => {
    localStorage.setItem('obelisk:followed-posts', JSON.stringify(['post-other']));
    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [
        {
          id: 'cat1', name: 'FORO', position: 0,
          channels: [
            { id: 'fch1', name: 'plaza-publica', emoji: null, type: 'forum', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
      followedPostIds: ['post-other'],
      followedPostMeta: {
        'post-other': {
          id: 'post-other',
          title: 'From Other Server',
          channelId: 'other-ch',
          channelName: 'other-forum',
          serverId: 's-other',
        },
      },
    });

    render(<ChannelSidebar />);
    expect(screen.queryByText('From Other Server')).not.toBeInTheDocument();
  });

  it('clicking a followed post row pushes /chat?c=&p= and dispatches popstate', async () => {
    const user = userEvent.setup();
    localStorage.setItem('obelisk:followed-posts', JSON.stringify(['post-a']));
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://obelisk.test', pathname: '/chat', search: '' },
      writable: true,
    });
    const pushSpy = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const popSpy = vi.fn();
    window.addEventListener('popstate', popSpy);

    useChatStore.setState({
      isLoadingChannels: false,
      servers: [{ id: 's1', name: 'Test', icon: null, banner: null }],
      activeServerId: 's1',
      pinnedChannels: [],
      categories: [
        {
          id: 'cat1', name: 'FORO', position: 0,
          channels: [
            { id: 'fch1', name: 'plaza-publica', emoji: null, type: 'forum', position: 0, categoryId: 'cat1' },
          ],
        },
      ],
      followedPostIds: ['post-a'],
      followedPostMeta: {
        'post-a': {
          id: 'post-a',
          title: 'Only Claws',
          channelId: 'fch1',
          channelName: 'plaza-publica',
          serverId: 's1',
        },
      },
    });

    render(<ChannelSidebar />);
    await user.click(screen.getByTestId('sidebar-post-row-post-a'));

    expect(pushSpy).toHaveBeenCalledWith(null, '', '/chat?c=plaza-publica&p=post-a');
    expect(popSpy).toHaveBeenCalled();

    window.removeEventListener('popstate', popSpy);
    pushSpy.mockRestore();
  });
});
