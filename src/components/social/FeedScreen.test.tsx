import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

const socialMocks = vi.hoisted(() => ({
  loadFollowingFeed: vi.fn(),
  loadGlobalFeed: vi.fn(),
  loadProfileFeed: vi.fn(),
  subscribeSocial: vi.fn((..._args: unknown[]) => () => {}),
  follows: ['f'.repeat(64)] as string[],
  contactsReady: true,
}));

vi.mock('@/lib/social/pool', () => ({
  subscribeSocial: socialMocks.subscribeSocial,
  querySocial: vi.fn().mockResolvedValue([]),
  socialRelays: () => ['wss://one.example'],
  applySocialRelays: vi.fn(),
  initSocial: vi.fn(),
  importNip65Relays: vi.fn().mockResolvedValue([]),
  SOCIAL_SDK_CACHE_NAMESPACE: 'obelisk-social-sdk/',
  // The relay-status watcher the toolbar pill starts reads these.
  poolEvents: {},
  socialPool: () => ({
    listConnectionStatus: () => new Map(),
    ensureRelay: vi.fn().mockResolvedValue({ connected: true, onclose: () => {} }),
    seenOn: new Map(),
  }),
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
  useMyContactListReady: () => socialMocks.contactsReady,
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
  socialMocks.contactsReady = true;
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

  it('offers starter packs when you follow nobody, not a pointer to Global', async () => {
    // A fresh key follows nobody. Sending someone to a firehose of
    // strangers leaves them the job the app should be doing.
    socialMocks.follows = [];
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('starter-packs-loading')).toBeInTheDocument());
    expect(screen.queryByTestId('feed-empty')).not.toBeInTheDocument();
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

  it('does not splice a late Following page into Global, or its cache', async () => {
    // A page requested on one tab used to resolve into whichever feed was on
    // screen when it landed — and the next write persisted those notes into
    // that feed's cache, permanently, because merges only add.
    let releaseFollowing: ((notes: NostrEvent[]) => void) | null = null;
    socialMocks.loadFollowingFeed
      .mockResolvedValueOnce([note('f1', 'from someone I follow', 3000)])
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFollowing = resolve; }));
    socialMocks.loadGlobalFeed.mockResolvedValue([note('g1', 'from the world', 2000, STRANGER)]);

    renderFeed();
    await waitFor(() => expect(screen.getByText('from someone I follow')).toBeInTheDocument());

    // Page 2 of Following goes out, then the reader switches to Global.
    fireEvent.click(screen.getByTestId('feed-load-more'));
    fireEvent.click(screen.getByTestId('feed-tab-global'));
    await waitFor(() => expect(screen.getByText('from the world')).toBeInTheDocument());

    await act(async () => {
      releaseFollowing?.([note('f2', 'late following page', 2500)]);
      await Promise.resolve();
    });

    expect(screen.queryByText('late following page')).not.toBeInTheDocument();

    flushFeedCacheWrites();
    const cached = JSON.stringify(window.localStorage);
    expect(cached).not.toContain('late following page');
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
    const scroller = screen.getByTestId('feed-scroll');
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

  it('puts source, filters and actions in one toolbar', () => {
    // These were three stacked rows, so the chrome was taller than the first
    // note — you scrolled before you read anything.
    renderFeed({ onOpenSettings: vi.fn() });
    const source = screen.getByTestId('feed-tab-following');
    const filter = screen.getByTestId('feed-filter-all');
    const search = screen.getByTestId('feed-search-open');

    const toolbar = source.closest('div')?.parentElement;
    expect(toolbar).toContainElement(filter);
    expect(toolbar).toContainElement(search);
    // Wrapping is what keeps it usable when the row can't fit.
    expect(toolbar?.className).toContain('flex-wrap');
  });

  it('never lets the filters be squeezed to zero width', () => {
    // On a phone they had `min-w-0 flex-1` beside the source pill, so they
    // shrank to nothing — present, sized to zero, and invisible because the
    // scrollbar is hidden. Full width when wrapped, a floor when inline.
    renderFeed();
    const group = screen.getByTestId('feed-filter-all').parentElement;
    expect(group?.className).toContain('w-full');
    expect(group?.className).toContain('lg:min-w-[13rem]');
  });

  it('keeps an accessible heading even though the title text is gone', () => {
    renderFeed();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Feed');
  });

  it('shows a floating compose button once the compose row scrolls away', async () => {
    // The inline row scrolls off within a screen or two, taking the only way
    // to post with it. jsdom has no IntersectionObserver, so drive the
    // callback directly.
    const observers: Array<(entries: { isIntersecting: boolean }[]) => void> = [];
    // Assigned directly rather than via vi.stubGlobal: the component reads
    // `typeof IntersectionObserver` at effect time, and the stub wasn't
    // visible to that lookup.
    (globalThis as Record<string, unknown>).IntersectionObserver = class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) { observers.push(cb); }
      observe() {}
      disconnect() {}
    };

    renderFeed();
    expect(screen.queryByTestId('feed-compose-fab')).not.toBeInTheDocument();

    await act(async () => { observers.forEach((cb) => cb([{ isIntersecting: false }])); });
    expect(screen.getByTestId('feed-compose-fab')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-compose-fab'));
    expect(screen.getByTestId('composer-input')).toBeInTheDocument();
    // It steps aside once the composer is open.
    expect(screen.queryByTestId('feed-compose-fab')).not.toBeInTheDocument();

    delete (globalThis as Record<string, unknown>).IntersectionObserver;
  });

  it('opens an article when its card is clicked', async () => {
    // The regression that prompted this: `onOpenArticle` was threaded all
    // the way through NoteCard but FeedList never declared or forwarded it,
    // so every article card was a focusable button whose handler no-oped.
    socialMocks.loadFollowingFeed.mockResolvedValue([{
      ...note('a', '## Body text'),
      kind: 30023,
      tags: [['d', 'post'], ['title', 'On Relays'], ['summary', 'Why they matter.']],
    }]);
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('note-article')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('note-article'));
    await waitFor(() => expect(screen.getByTestId('feed-article-reader')).toBeInTheDocument());
    expect(screen.getByTestId('article-reader')).toHaveTextContent('On Relays');
  });

  it('hands the article to the host when one is supplied', async () => {
    // The desktop shell reuses its side pane rather than stacking a modal
    // over the feed.
    const onOpenArticle = vi.fn();
    socialMocks.loadFollowingFeed.mockResolvedValue([{
      ...note('a', 'body'),
      kind: 30023,
      tags: [['d', 'post'], ['title', 'On Relays']],
    }]);
    renderFeed({ onOpenArticle });
    await waitFor(() => expect(screen.getByTestId('note-article')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('note-article'));
    expect(onOpenArticle).toHaveBeenCalledWith(expect.objectContaining({ kind: 30023 }));
    expect(screen.queryByTestId('feed-article-reader')).not.toBeInTheDocument();
  });

  it('reorders when you switch to Top, without refetching', async () => {
    // Ranking reorders the window we already have — `sort` is deliberately
    // not part of the feed key, so switching must not discard the page.
    const now = Math.floor(Date.now() / 1000);
    socialMocks.loadFollowingFeed.mockResolvedValue([
      note('new', 'just posted', now),
      note('old', 'older but busy', now - 7200),
    ]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('just posted')).toBeInTheDocument());

    socialMocks.loadFollowingFeed.mockClear();
    fireEvent.click(screen.getByTestId('feed-sort-top'));
    // No refetch: the same notes, reordered.
    expect(socialMocks.loadFollowingFeed).not.toHaveBeenCalled();
    expect(screen.getByText('older but busy')).toBeInTheDocument();
  });

  it('keeps Recent as the raw timeline', async () => {
    const now = Math.floor(Date.now() / 1000);
    socialMocks.loadFollowingFeed.mockResolvedValue([
      note('new', 'newest', now),
      note('old', 'oldest', now - 7200),
    ]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('newest')).toBeInTheDocument());

    const rows = screen.getAllByTestId('note-card');
    expect(rows[0]).toHaveTextContent('newest');
  });

  it('exposes search and relay settings', async () => {
    const onOpenSettings = vi.fn();
    renderFeed({ onOpenSettings });
    fireEvent.click(screen.getByTestId('feed-settings'));
    expect(onOpenSettings).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('feed-search-open'));
    expect(screen.getByTestId('feed-search')).toBeInTheDocument();
  });

  it('refreshes when you pull up at the top of the feed', async () => {
    // The gesture that replaced the refresh button: at the top of a feed,
    // pulling further up means "show me what's new".
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    const scroller = screen.getByTestId('feed-scroll');
    const before = socialMocks.loadFollowingFeed.mock.calls.length;
    // One nudge is below the threshold — otherwise a stray trackpad twitch
    // costs a relay round trip.
    fireEvent.wheel(scroller, { deltaY: -20 });
    expect(socialMocks.loadFollowingFeed.mock.calls.length).toBe(before);

    fireEvent.wheel(scroller, { deltaY: -80 });
    await waitFor(() => expect(
      socialMocks.loadFollowingFeed.mock.calls.length,
    ).toBeGreaterThan(before));
  });

  it('does not refresh when the pull happens away from the top', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    const scroller = screen.getByTestId('feed-scroll');
    Object.defineProperty(scroller, 'scrollTop', { value: 400, writable: true });
    const before = socialMocks.loadFollowingFeed.mock.calls.length;

    fireEvent.wheel(scroller, { deltaY: -400 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(socialMocks.loadFollowingFeed.mock.calls.length).toBe(before);
  });

  it('refreshes on the way back up, without needing the pull gesture', async () => {
    // The pull was the *only* way to fetch new notes, and it required being
    // at an exact offset and over-scrolling from there — on a phone the
    // browser eats that as rubber-banding, so scrolling up did nothing.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    const scroller = screen.getByTestId('feed-scroll');
    Object.defineProperty(scroller, 'scrollTop', { value: 900, writable: true });
    fireEvent.scroll(scroller);
    const before = socialMocks.loadFollowingFeed.mock.calls.length;

    (scroller as HTMLElement & { scrollTop: number }).scrollTop = 0;
    fireEvent.scroll(scroller);
    await waitFor(() => expect(
      socialMocks.loadFollowingFeed.mock.calls.length,
    ).toBeGreaterThan(before));
  });

  it('offers a way back to the top once you have scrolled away', async () => {
    // Both shells: the pending-notes pill lives at the top of the list, so a
    // reader several screens down had nothing to tap at all.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
    expect(screen.queryByTestId('feed-back-to-top')).not.toBeInTheDocument();

    const scroller = screen.getByTestId('feed-scroll');
    Object.defineProperty(scroller, 'scrollTop', { value: 900, writable: true });
    scroller.scrollTo = vi.fn();
    fireEvent.scroll(scroller);

    const button = await screen.findByTestId('feed-back-to-top');
    fireEvent.click(button);
    expect(scroller.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });

  it('lets the app background through instead of painting over it', async () => {
    // The shell paints a drifting gradient that the chat body and the relay
    // top bar both show. The feed was an opaque black column with an opaque
    // bar on top, which read as a different app inside the window.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    expect(screen.getByTestId('feed-screen').className).not.toContain('bg-lc-black');
    const toolbar = screen.getByTestId('feed-tab-global').closest('div')?.parentElement;
    expect(toolbar?.className).toContain('lc-header-surface');
  });

  it('keeps search reachable, and sized like a control', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('a', 'first')]);
    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
    // On a wide pane this was a borderless grey glyph — present, but not
    // reading as a button people could find.
    expect(screen.getByTestId('feed-search-open').className).toContain('lc-icon-btn');
  });

  it('gives a phone one filter button instead of two chip strips', async () => {
    // The chips were an 11px hairline-scrolling strip; on a phone they're
    // behind a header-sized button that opens a sheet.
    renderFeed({ mobile: true });
    expect(screen.queryByTestId('feed-filter-articles')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-filters-open'));
    const sheet = screen.getByTestId('feed-filter-sheet');
    expect(sheet).toContainElement(screen.getByTestId('feed-filter-articles'));
    expect(sheet).toContainElement(screen.getByTestId('feed-sort-top'));

    fireEvent.click(screen.getByTestId('feed-sort-top'));
    expect(screen.getByTestId('feed-sort-top')).toHaveAttribute('aria-selected', 'true');
  });

  it('takes host controls into its toolbar instead of a second header', () => {
    // The desktop pane used to stack a "Feed" title bar with an ✕ above a
    // toolbar that already says what you're looking at.
    renderFeed({ actions: <button type="button" data-testid="feed-pane-close">x</button> });
    const toolbar = screen.getByTestId('feed-search-open').closest('div')?.parentElement;
    expect(toolbar).toContainElement(screen.getByTestId('feed-pane-close'));
  });

  it('gives a half-width pane the same one-line toolbar as a phone', async () => {
    // Embedded in a split pane the source segment, two chip strips and the
    // actions wrapped onto a second row — a pane is as narrow as a phone.
    renderFeed({ embedded: true });
    expect(screen.queryByTestId('feed-filter-articles')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-filters-open')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-filters-open'));
    // A dropdown, not a bottom sheet: this is a pane on a desktop.
    const sheet = screen.getByTestId('feed-filter-sheet');
    expect(sheet.className).not.toContain('justify-end');
    expect(sheet).toContainElement(screen.getByTestId('feed-filter-media'));
  });

  it('grids the Media filter instead of listing note rows', async () => {
    // Picking Media means "I want to look" — rows of text with pictures in
    // them is a text feed that happens to contain images.
    socialMocks.loadFollowingFeed.mockResolvedValue([
      note('m1', 'look https://example.com/a.jpg'),
    ]);
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('feed-list')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('feed-filter-media'));
    await waitFor(() => expect(screen.getByTestId('profile-media-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('feed-list')).not.toBeInTheDocument();
  });

  it('pins the pane actions to the right, beside the source pill', async () => {
    // `lg:ml-0` was for the wide layout where the chips fill the middle; in
    // a half-width pane it left the actions bunched against the pill.
    renderFeed({ embedded: true });
    const actions = screen.getByTestId('feed-search-open').parentElement!;
    expect(actions.className).toContain('ml-auto');
    expect(actions.className).not.toContain('lg:ml-0');
    // Filter, search and whatever the host adds all live in that cluster.
    expect(actions).toContainElement(screen.getByTestId('feed-filters-open'));
  });

  it('widens to more relays before declaring the feed finished', async () => {
    // "No more content" is usually a statement about four relays, not
    // about Nostr.
    socialMocks.loadFollowingFeed
      .mockResolvedValueOnce([note('a', 'first', 3000)])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([note('b', 'from a wider set', 2000)]);

    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('feed-load-more'));
    await waitFor(() => expect(screen.getByText('from a wider set')).toBeInTheDocument());

    // The retry went to a bigger relay set than the configured one.
    const [, firstOpts] = socialMocks.loadFollowingFeed.mock.calls[1];
    const [, retryOpts] = socialMocks.loadFollowingFeed.mock.calls[2];
    expect(retryOpts.relays.length).toBeGreaterThan(firstOpts.relays.length);
  });

  it('stops for good once the wider set is empty too', async () => {
    socialMocks.loadFollowingFeed
      .mockResolvedValueOnce([note('a', 'first', 3000)])
      .mockResolvedValue([]);

    renderFeed();
    await waitFor(() => expect(screen.getByText('first')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('feed-load-more'));

    await waitFor(() => expect(screen.queryByTestId('feed-load-more')).not.toBeInTheDocument());
  });

  it('pages the media grid too, not just the list', async () => {
    // The grid bypasses FeedList and with it the sentinel that pages the
    // feed — a wall of images stopped at the first page.
    socialMocks.loadFollowingFeed.mockResolvedValue([
      note('m1', 'look https://example.com/a.jpg'),
    ]);
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('feed-list')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('feed-filter-media'));
    await waitFor(() => expect(screen.getByTestId('profile-media-grid')).toBeInTheDocument());
    expect(screen.getByTestId('infinite-sentinel')).toBeInTheDocument();
  });

  it('opens a tag in its own search, seeded, rather than leaving for /t', async () => {
    // Clicking #bitcoin used to navigate to a standalone page, and the feed
    // you were reading was gone. Same handler a hashtag inside a note uses.
    socialMocks.loadFollowingFeed.mockResolvedValue([
      { ...note('a', 'gm'), tags: [['t', 'bitcoin']] },
    ]);
    renderFeed();
    await waitFor(() => expect(screen.getByTestId('trending-tag')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('trending-tag'));
    expect(screen.getByTestId('feed-search-input')).toHaveValue('#bitcoin');
  });

  it('does not offer starter packs to an account whose follows are still loading', async () => {
    // `useMyFollows()` is [] both for someone who follows nobody and for
    // someone whose kind 3 is in flight — treating the second as the first
    // showed the starter packs to accounts with hundreds of follows.
    socialMocks.follows = [];
    socialMocks.contactsReady = false;
    renderFeed();
    expect(screen.queryByTestId('starter-packs')).not.toBeInTheDocument();
    expect(screen.queryByTestId('starter-packs-loading')).not.toBeInTheDocument();
  });

  it('paints cached notes while the follow list is still loading', async () => {
    // `authors` is [] both for "follows nobody" and "kind 3 hasn't landed",
    // and filtering the cached Following feed against an empty set dropped
    // every note — on exactly the paint the cache exists for.
    socialMocks.loadFollowingFeed.mockResolvedValue([note('cached', 'from yesterday', 5000)]);
    const first = renderFeed();
    await waitFor(() => expect(screen.getByText('from yesterday')).toBeInTheDocument());
    flushFeedCacheWrites();
    first.unmount();

    // Reload with the contact list not yet resolved.
    socialMocks.follows = [];
    socialMocks.contactsReady = false;
    socialMocks.loadFollowingFeed.mockResolvedValue([]);
    renderFeed();
    expect(screen.getByText('from yesterday')).toBeInTheDocument();
  });

  it('does not overwrite the cache with nothing while follows are unknown', async () => {
    socialMocks.loadFollowingFeed.mockResolvedValue([note('cached', 'from yesterday', 5000)]);
    const first = renderFeed();
    await waitFor(() => expect(screen.getByText('from yesterday')).toBeInTheDocument());
    flushFeedCacheWrites();
    first.unmount();

    socialMocks.follows = [];
    socialMocks.contactsReady = false;
    renderFeed();
    flushFeedCacheWrites();
    expect(JSON.stringify(window.localStorage)).toContain('from yesterday');
  });

  it('keeps the chips inline on desktop, where there is room', () => {
    renderFeed();
    expect(screen.queryByTestId('feed-filters-open')).not.toBeInTheDocument();
    expect(screen.getByTestId('feed-filter-articles')).toBeInTheDocument();
  });

  it('composes full-screen on a phone, with no inline compose row', async () => {
    // The row promised an input and delivered a link to one; the sheet is
    // the input.
    renderFeed({ mobile: true });
    expect(screen.queryByTestId('feed-compose')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('feed-compose-fab'));
    expect(await screen.findByTestId('mobile-composer')).toBeInTheDocument();
  });

  it('composes in place on desktop', async () => {
    renderFeed();
    fireEvent.click(await screen.findByTestId('feed-compose'));
    expect(await screen.findByTestId('note-composer')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-composer')).not.toBeInTheDocument();
  });

  it('has no refresh button — pulling up at the top refreshes instead', () => {
    // A button duplicating a gesture people already make is just chrome,
    // and new notes announce themselves with the green pill.
    renderFeed();
    expect(screen.queryByTestId('feed-refresh')).not.toBeInTheDocument();
  });

});
