import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/services/nostr-bridge', async () => {
  const { bridgeMock, userMetadataFixture } = await import('@tests/support/mocks/nostr-bridge');
  return bridgeMock({
    useCurrentRelayUrl: () => 'wss://relay.example',
    useUserMetadata: () => userMetadataFixture({ displayName: 'Alice' }),
    nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
  });
});

// `useAuthor` layers the bridge's kind 0 over the social resolver, and the
// resolver (`useSocialProfile`) coalesces its lookups into a SimplePool
// request against the user's social relays. Left real, every rendered author
// queued a relay read that fired a few ms later, inside whichever test
// happened to be awaiting at the time. The reader's identity line is covered
// by the bridge stub above; the resolver is not what this file tests.
vi.mock('@/services/social/profiles', () => ({
  ensureSocialProfiles: vi.fn().mockResolvedValue(undefined),
  useSocialProfile: () => null,
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

const highlightMocks = vi.hoisted(() => ({ fetchArticleHighlights: vi.fn() }));
vi.mock('@/services/social/highlights', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/social/highlights')>();
  return { ...actual, fetchArticleHighlights: highlightMocks.fetchArticleHighlights };
});

beforeEach(() => {
  vi.clearAllMocks();
  highlightMocks.fetchArticleHighlights.mockResolvedValue([]);
});

import ArticleReader, { ArticleCard, articleMeta, readingMinutes } from '@/components/social/ArticleCard';

const article = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'a'.repeat(64),
  pubkey: 'b'.repeat(64),
  content: '## Heading\n\nSome body text.',
  created_at: 1_700_000_000,
  kind: 30023,
  sig: '',
  tags: [
    ['d', 'my-post'],
    ['title', 'On Relays'],
    ['summary', 'Why relays matter.'],
    ['image', 'https://cdn.example/hero.jpg'],
    ['published_at', '1699000000'],
    ['t', 'nostr'],
    ['t', 'relays'],
  ],
  ...over,
});

const wrap = (ui: React.ReactNode) => render(
  <LocaleProvider initialLocale="en">{ui}</LocaleProvider>,
);

describe('articleMeta', () => {
  it('reads NIP-23 tags', () => {
    expect(articleMeta(article())).toMatchObject({
      title: 'On Relays',
      summary: 'Why relays matter.',
      image: 'https://cdn.example/hero.jpg',
      identifier: 'my-post',
      publishedAt: 1699000000,
      hashtags: ['nostr', 'relays'],
    });
  });

  it('falls back to created_at when published_at is absent or junk', () => {
    // published_at is the author's stated time; created_at moves on every
    // edit of a replaceable event, so it's only the fallback.
    const noPublished = article({ tags: [['d', 'x']] });
    expect(articleMeta(noPublished).publishedAt).toBe(1_700_000_000);
    const junk = article({ tags: [['published_at', 'soon']] });
    expect(articleMeta(junk).publishedAt).toBe(1_700_000_000);
  });
});

describe('readingMinutes', () => {
  it('never reports zero minutes', () => {
    expect(readingMinutes('hi')).toBe(1);
  });

  it('scales with length', () => {
    expect(readingMinutes('word '.repeat(2200))).toBe(10);
  });
});

describe('ArticleCard', () => {
  it('shows title, summary and reading time rather than raw markdown', () => {
    // The plain-note path rendered a 6000-word essay as literal `##` markdown
    // in a chat bubble.
    wrap(<ArticleCard note={article()} />);
    expect(screen.getByText('On Relays')).toBeInTheDocument();
    expect(screen.getByText('Why relays matter.')).toBeInTheDocument();
    expect(screen.getByTestId('note-article')).toHaveTextContent('min read');
    expect(screen.queryByText(/## Heading/)).not.toBeInTheDocument();
  });

  it('names an untitled article rather than showing nothing', () => {
    wrap(<ArticleCard note={article({ tags: [['d', 'x']] })} />);
    expect(screen.getByText('Untitled article')).toBeInTheDocument();
  });
});

describe('ArticleReader', () => {
  it('lays out the article with typographic styling applied to the body', () => {
    const { container } = wrap(<ArticleReader note={article()} />);
    expect(screen.getByTestId('article-reader')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('On Relays');
    // `.article-body` is what restores heading/list/quote rhythm.
    expect(container.querySelector('.article-body')).toBeInTheDocument();
    expect(screen.getByTestId('md')).toHaveTextContent('Some body text.');
  });

  it('credits the author and shows every hashtag', () => {
    wrap(<ArticleReader note={article()} />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('#nostr')).toBeInTheDocument();
    expect(screen.getByText('#relays')).toBeInTheDocument();
  });
});

describe('community highlights in the reader', () => {
  const highlight = (pubkey: string, content: string): NostrEvent => ({
    id: `h-${pubkey}`,
    pubkey,
    kind: 9802,
    content,
    created_at: 1,
    tags: [['a', `30023:${'b'.repeat(64)}:my-post`]],
    sig: '',
  });

  it('asks for nothing until the reader turns them on', () => {
    // A feed of 50 articles would otherwise issue 50 queries nobody wanted.
    wrap(<ArticleReader note={article()} />);
    expect(highlightMocks.fetchArticleHighlights).not.toHaveBeenCalled();
  });

  it('fetches and counts them when toggled', async () => {
    highlightMocks.fetchArticleHighlights.mockResolvedValue([
      highlight('c'.repeat(64), 'Some body text.'),
      highlight('d'.repeat(64), 'Some body text.'),
    ]);
    wrap(<ArticleReader note={article()} />);

    fireEvent.click(screen.getByTestId('article-highlights-toggle'));
    await waitFor(() => expect(highlightMocks.fetchArticleHighlights).toHaveBeenCalled());
    // Two people, one passage: identical passages merge.
    await waitFor(() => expect(screen.getByTestId('article-highlights-toggle')).toHaveTextContent('1'));
  });

  it('reports pressed state, so the toggle reads as a switch', async () => {
    wrap(<ArticleReader note={article()} />);
    const toggle = screen.getByTestId('article-highlights-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not break when the relays return nothing', async () => {
    wrap(<ArticleReader note={article()} />);
    fireEvent.click(screen.getByTestId('article-highlights-toggle'));
    await waitFor(() => expect(highlightMocks.fetchArticleHighlights).toHaveBeenCalled());
    expect(screen.getByTestId('article-reader')).toBeInTheDocument();
  });
});
