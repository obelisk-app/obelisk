import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ChannelLinkPill from './ChannelLinkPill';
import { useChatStore } from '@/store/chat';

function resetStore() {
  useChatStore.setState({ slugCache: {} });
}

function mockFetchOnce(body: any, status = 200) {
  const fn = vi.fn(() =>
    Promise.resolve({
      ok: status < 400,
      status,
      json: async () => body,
    } as Response),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('ChannelLinkPill', () => {
  const origPush = window.history.pushState;

  beforeEach(() => {
    resetStore();
    window.history.pushState = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState = origPush;
    vi.restoreAllMocks();
  });

  it('renders channel pill with resolved name', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'plaza-publica',
      postTitle: null,
      messageAuthorName: null,
      noAccess: false,
    });
    render(<ChannelLinkPill slug="plaza-publica" href="/chat?c=plaza-publica" />);
    await waitFor(() => {
      expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#plaza-publica');
    });
  });

  it('renders post pill with post title', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'forum',
      postTitle: 'My Post Title',
      messageAuthorName: null,
      noAccess: false,
    });
    render(
      <ChannelLinkPill slug="forum" postId="p1" href="/chat?c=forum&p=p1" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('📋 My Post Title');
    });
  });

  it('renders message pill with channel name prefixed ↩', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      postTitle: null,
      messageAuthorName: 'alice',
      noAccess: false,
    });
    render(
      <ChannelLinkPill slug="general" messageId="m1" href="/chat?c=general&m=m1" />,
    );
    await waitFor(() => {
      expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('↩ general');
    });
  });

  it('renders no-access pill with lock and suppresses click', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'secret',
      postTitle: null,
      messageAuthorName: null,
      noAccess: true,
    });
    render(<ChannelLinkPill slug="secret" href="/chat?c=secret" />);
    await waitFor(() => {
      expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('🔒');
    });
    const pill = screen.getByTestId('channel-link-pill');
    fireEvent.click(pill);
    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it('click without modifier pushes state and dispatches popstate', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      postTitle: null,
      messageAuthorName: null,
      noAccess: false,
    });
    const popHandler = vi.fn();
    window.addEventListener('popstate', popHandler);
    render(<ChannelLinkPill slug="general" href="/chat?c=general" />);
    await waitFor(() => {
      expect(screen.getByTestId('channel-link-pill')).toHaveTextContent('#general');
    });
    fireEvent.click(screen.getByTestId('channel-link-pill'));
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(popHandler).toHaveBeenCalled();
    window.removeEventListener('popstate', popHandler);
  });

  it('click with meta key does not push state', async () => {
    mockFetchOnce({
      serverId: 's1',
      channelId: 'c1',
      channelName: 'general',
      postTitle: null,
      messageAuthorName: null,
      noAccess: false,
    });
    render(<ChannelLinkPill slug="general" href="/chat?c=general" />);
    await waitFor(() => screen.getByTestId('channel-link-pill'));
    fireEvent.click(screen.getByTestId('channel-link-pill'), { metaKey: true });
    expect(window.history.pushState).not.toHaveBeenCalled();
  });
});
