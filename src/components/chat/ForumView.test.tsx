import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/store/auth', () => ({
  useAuthStore: () => ({
    profile: { pubkey: 'my-pk', name: 'Me' },
  }),
}));

import ForumView from './ForumView';

const mockPosts = [
  { id: 'p1', channelId: 'ch1', authorPubkey: 'author-pk', title: 'First Post', content: 'Hello world', createdAt: new Date().toISOString(), replyCount: 2, lastReplyAt: new Date().toISOString(), tags: [] },
];

const mockPostDetail = {
  post: { id: 'p1', channelId: 'ch1', authorPubkey: 'author-pk', title: 'First Post', content: 'Hello world', createdAt: new Date().toISOString() },
  replies: [
    { id: 'r1', channelId: 'ch1', authorPubkey: 'reply-pk', content: 'Nice post!', createdAt: new Date().toISOString() },
  ],
  hasMore: false,
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.match(/\/posts\/p1$/)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(mockPostDetail) });
    }
    if (url.match(/\/posts/)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ posts: mockPosts, hasMore: false }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }));
});

const profileCache = new Map([
  ['author-pk', { name: 'Alice' }],
  ['reply-pk', { name: 'Bob' }],
]);

describe('ForumView', () => {
  it('renders post list on mount', async () => {
    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => {
      expect(screen.getByText('First Post')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('shows empty state when no posts', async () => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ posts: [], hasMore: false }) })
    ));

    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => {
      expect(screen.getByTestId('forum-empty')).toBeInTheDocument();
    });
    expect(screen.getByText('No posts yet')).toBeInTheDocument();
  });

  it('clicking a post shows detail view with back button', async () => {
    const user = userEvent.setup();
    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => expect(screen.getByText('First Post')).toBeInTheDocument());
    await user.click(screen.getByTestId('forum-post-card'));

    await waitFor(() => {
      expect(screen.getByTestId('forum-detail')).toBeInTheDocument();
    });
    expect(screen.getByTestId('forum-back')).toBeInTheDocument();
    expect(screen.getByText('Nice post!')).toBeInTheDocument();
  });

  it('back button returns to list view', async () => {
    const user = userEvent.setup();
    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => expect(screen.getByText('First Post')).toBeInTheDocument());
    await user.click(screen.getByTestId('forum-post-card'));
    await waitFor(() => expect(screen.getByTestId('forum-detail')).toBeInTheDocument());

    await user.click(screen.getByTestId('forum-back'));
    await waitFor(() => {
      expect(screen.getByTestId('forum-list')).toBeInTheDocument();
    });
  });

  it('New Post button shows creation form', async () => {
    const user = userEvent.setup();
    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => expect(screen.getByTestId('new-post-btn')).toBeInTheDocument());
    await user.click(screen.getByTestId('new-post-btn'));

    expect(screen.getByTestId('new-post-form')).toBeInTheDocument();
    expect(screen.getByTestId('new-post-title')).toBeInTheDocument();
    expect(screen.getByTestId('new-post-content')).toBeInTheDocument();
  });

  it('detail view has reply input', async () => {
    const user = userEvent.setup();
    render(<ForumView channelId="ch1" channelName="forum-test" profileCache={profileCache} />);

    await waitFor(() => expect(screen.getByText('First Post')).toBeInTheDocument());
    await user.click(screen.getByTestId('forum-post-card'));

    await waitFor(() => {
      expect(screen.getByTestId('forum-reply-input')).toBeInTheDocument();
    });
  });
});
