import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const socialMocks = vi.hoisted(() => ({
  loadFollowingFeed: vi.fn(),
  loadGlobalFeed: vi.fn(),
  loadProfileFeed: vi.fn(),
  subscribeSocial: vi.fn((..._args: unknown[]) => () => {}),
  follows: ['f'.repeat(64)] as string[],
}));

vi.mock('@/lib/social/pool', () => ({
  subscribeSocial: socialMocks.subscribeSocial,
  querySocial: vi.fn().mockResolvedValue([]),
  socialRelays: () => ['wss://one.example'],
  applySocialRelays: vi.fn(),
  initSocial: vi.fn(),
  importNip65Relays: vi.fn().mockResolvedValue([]),
  SOCIAL_SDK_CACHE_NAMESPACE: 'obelisk-social-sdk/',
}));

vi.mock('@/lib/social/engagement', () => ({
  ensureCounts: vi.fn().mockResolvedValue(undefined),
  getCounts: () => ({ reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 }),
  subscribeCounts: () => () => {},
  bumpCounts: vi.fn(),
  ZERO_COUNTS: { reactionCount: 0, repostCount: 0, zapTotalSats: 0, replyCount: 0 },
}));

vi.mock('@/lib/social/feed', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/social/feed')>();
  return {
    ...actual,
    loadFollowingFeed: socialMocks.loadFollowingFeed,
    loadGlobalFeed: socialMocks.loadGlobalFeed,
    loadProfileFeed: socialMocks.loadProfileFeed,
  };
});

vi.mock('@/lib/nostr-bridge', () => ({
  getBridge: async () => ({ publishEvent: vi.fn() }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
  useCurrentRelayUrl: () => 'wss://relay.example',
  useMyPubkey: () => 'b'.repeat(64),
  useMyFollows: () => socialMocks.follows,
  useMyContactList: () => null,
  useMyContactListReady: () => true,
  useUserMetadata: () => ({ displayName: 'Alice', name: 'alice' }),
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div>{content}</div>,
}));

import FeedScreen from './FeedScreen';
import { flushFeedCacheWrites } from '@/lib/social/cache';

const FOLLOWED = 'f'.repeat(64);
const STRANGER = 'a'.repeat(64);

const note = (id: string, content: string, createdAt = 1000, pubkey = FOLLOWED): NostrEvent => ({
  id,
  pubkey,
  content,
  created_at: createdAt,
  tags: [],
  kind: 1,
  sig: '',
});

const renderFeed = (props = {}) => render(
  <LocaleProvider><FeedScreen {...props} /></LocaleProvider>,
);

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  socialMocks.follows = ['f'.repeat(64)];
  socialMocks.loadFollowingFeed.mockResolvedValue([]);
  socialMocks.loadGlobalFeed.mockResolvedValue([]);
  socialMocks.subscribeSocial.mockReturnValue(() => {});
});

describe('FeedScreen', () => {
  it('opens on Following and renders notes from the people you follow', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'gm nostr')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('gm nostr')).toBeInTheDocument());
    expect(socialMocks.loadGlobalFeed).not.toHaveBeenCalled();
  });

  it('switches to the global firehose', async () => {
    socialMocks.loadGlobalFeed.mockResolvedValue([note('g', 'from the world')]);
    renderFeed();
    fireEvent.click(screen.getByTestId('feed-tab-global'));
    await waitFor(() => expect(screen.getByText('from the world')).toBeInTheDocument());
  });

  it('points an empty Following feed at the Global tab instead of a dead end', async () => {
    socialMocks.follows = [];
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('feed-empty')).toBeInTheDocument());
    expect(screen.getByText(/Global tab/)).toBeInTheDocument();
    // With no follows there is nothing to ask the relays for.
    expect(socialMocks.loadFollowingFeed).not.toHaveBeenCalled();
  });

  it('pages older notes with the until cursor', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValueOnce([note('new', 'newest', 2000)]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('newest')).toBeInTheDocument());

    socialMocks.loadFollowingFeed.mockResolvedValueOnce([note('old', 'older', 1000)]);
    fireEvent.click(screen.getByTestId('feed-load-more'));

    await waitFor(() => expect(screen.getByText('older')).toBeInTheDocument());
    // The cursor is the oldest loaded timestamp — this is the pagination the
    // old feed never had (it was capped at 100 with no backfill).
    const lastCall = socialMocks.loadFollowingFeed.mock.calls.at(-1);
    expect(lastCall?.[1]).toMatchObject({ until: 2000 });
  });

  it('shows new notes immediately while you are at the top of the feed', async () => {
    // A feed that makes you click a pill to see new posts when you're
    // already looking at the top of the list isn't live, it's just slow.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    const live: { emit?: (event: NostrEvent) => void } = {};
    socialMocks.subscribeSocial.mockImplementation((...args: unknown[]) => {
      live.emit = args[1] as (event: NostrEvent) => void;
      return () => {};
    });

    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    live.emit?.(note('live', 'just arrived', Math.floor(Date.now() / 1000) + 5));
    await waitFor(() => expect(screen.getByText('just arrived')).toBeInTheDocument());
    expect(screen.queryByTestId('feed-pending')).not.toBeInTheDocument();
  });

  it('drops live events from people you do not follow', async () => {
    // The shared coalescer fans every consumer's events into every handle,
    // so the Following feed was receiving the kind-1 notes fetched by the
    // reply-count query — i.e. whoever replied to anything.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    const live: { emit?: (event: NostrEvent) => void } = {};
    socialMocks.subscribeSocial.mockImplementation((...args: unknown[]) => {
      live.emit = args[1] as (event: NostrEvent) => void;
      return () => {};
    });

    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    live.emit?.(note('x', 'from a stranger', Math.floor(Date.now() / 1000) + 5, STRANGER));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText('from a stranger')).not.toBeInTheDocument();
    expect(screen.queryByTestId('feed-pending')).not.toBeInTheDocument();
  });

  it('buffers behind a pill once the reader has scrolled away', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    const live: { emit?: (event: NostrEvent) => void } = {};
    socialMocks.subscribeSocial.mockImplementation((...args: unknown[]) => {
      live.emit = args[1] as (event: NostrEvent) => void;
      return () => {};
    });

    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    // Scroll down: splicing notes in here would shift what's being read.
    const scroller = screen.getByTestId('feed-list').parentElement as HTMLElement;
    Object.defineProperty(scroller, 'scrollTop', { value: 800, writable: true });
    fireEvent.scroll(scroller);

    live.emit?.(note('live', 'just arrived', Math.floor(Date.now() / 1000) + 5));
    await waitFor(() => expect(screen.getByTestId('feed-pending')).toBeInTheDocument());
    expect(screen.queryByText('just arrived')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-pending'));
    await waitFor(() => expect(screen.getByText('just arrived')).toBeInTheDocument());
  });

  it('paints from cache on remount instead of showing skeletons again', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'cached note')]);
    const first = renderFeed();
    await waitFor(() => expect(screen.getByText('cached note')).toBeInTheDocument());
    flushFeedCacheWrites();
    first.unmount();

    socialMocks.loadFollowingFeed.mockImplementation(() => new Promise(() => {}));
    renderFeed();
    await waitFor(() => expect(screen.getByText('cached note')).toBeInTheDocument());
    expect(screen.queryByTestId('feed-loading')).not.toBeInTheDocument();
  });

  it('narrows the relay request when you filter by content type', async () => {
    // Asking for 50 mixed events and showing the three articles among them
    // is how an "Articles" view ends up looking empty.
    renderFeed();
    await waitFor(() => expect(socialMocks.loadFollowingFeed).toHaveBeenCalled());

    socialMocks.loadFollowingFeed.mockClear();
    fireEvent.click(screen.getByTestId('feed-filter-articles'));
    await waitFor(() => expect(socialMocks.loadFollowingFeed).toHaveBeenCalled());
    expect(socialMocks.loadFollowingFeed.mock.calls.at(-1)?.[1])
      .toMatchObject({ filter: 'articles' });
  });

  it('keeps a filtered feed in its own cache slot', async () => {
    // A narrowed REQ returns a different page, so sharing a cache entry with
    // the unfiltered feed would paint notes the filter excludes.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'a short note')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('a short note')).toBeInTheDocument());

    socialMocks.loadFollowingFeed.mockResolvedValue([]);
    fireEvent.click(screen.getByTestId('feed-filter-articles'));
    await waitFor(() => expect(screen.queryByText('a short note')).not.toBeInTheDocument());
  });

  it('exposes refresh and relay settings', async () => {
    const onOpenSettings = vi.fn();
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed({ onOpenSettings });
    fireEvent.click(screen.getByTestId('feed-settings'));
    expect(onOpenSettings).toHaveBeenCalled();

    // Refresh is disabled while a fetch is in flight, so wait for the first
    // load to settle before clicking it.
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
    socialMocks.loadFollowingFeed.mockClear();
    fireEvent.click(screen.getByTestId('feed-refresh'));
    await waitFor(() => expect(socialMocks.loadFollowingFeed).toHaveBeenCalled());
  });

  it('disables refresh while a fetch is in flight, and spins it', () => {
    // The old refresh was a bare text glyph with no busy state: clicking it
    // looked exactly like not clicking it.
    socialMocks.loadFollowingFeed.mockImplementation(() => new Promise(() => {}));
    renderFeed();
    const refresh = screen.getByTestId('feed-refresh') as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    expect(refresh.querySelector('svg')).toHaveClass('animate-spin');
  });
});
