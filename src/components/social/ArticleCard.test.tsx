import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';
import { LocaleProvider } from '@/i18n/context';

vi.mock('@/lib/nostr-bridge', () => ({
  useCurrentRelayUrl: () => 'wss://relay.example',
  useUserMetadata: () => ({ displayName: 'Alice', picture: null }),
  nostrActions: { ensureUserMetadata: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('@/components/chat/MessageContent', () => ({
  default: ({ content }: { content: string }) => <div data-testid="md">{content}</div>,
}));

import ArticleReader, { ArticleCard, articleMeta, readingMinutes } from './ArticleCard';

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
