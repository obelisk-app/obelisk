import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

const mocks = vi.hoisted(() => ({ querySocial: vi.fn() }));
vi.mock('./pool', () => ({ querySocial: mocks.querySocial, socialRelays: () => ['wss://a'] }));

const {
  articleCoordinate,
  fetchArticleHighlights,
  filterFeedHighlights,
  highlightRuns,
  highlightSource,
} = await import('./highlights');

const ev = (over: Partial<NostrEvent> = {}): NostrEvent => ({
  id: 'h1',
  pubkey: 'a'.repeat(64),
  kind: 9802,
  content: 'a passage worth marking',
  created_at: 10,
  tags: [],
  sig: '',
  ...over,
});

const ARTICLE = {
  id: 'article-1',
  kind: 30023,
  pubkey: 'b'.repeat(64),
  tags: [['d', 'my-post']],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.querySocial.mockResolvedValue([]);
});

describe('highlightSource', () => {
  it('prefers the coordinate, which survives an edit of the article', () => {
    const source = highlightSource({ tags: [['e', 'evt'], ['a', '30023:pk:slug']] });
    expect(source).toEqual({ kind: 'address', coordinate: '30023:pk:slug' });
  });

  it('falls back to the event id', () => {
    expect(highlightSource({ tags: [['e', 'evt']] })).toEqual({ kind: 'event', id: 'evt' });
  });

  it('reads an external page from the r tag', () => {
    expect(highlightSource({ tags: [['r', 'https://example.com/x']] }))
      .toEqual({ kind: 'url', url: 'https://example.com/x' });
  });

  it('is null when nothing says what was highlighted', () => {
    expect(highlightSource({ tags: [] })).toBeNull();
  });
});

describe('filterFeedHighlights', () => {
  it('drops a highlight of a Nostr article — it belongs on the article', () => {
    // As a feed row it reads as a stranger posting a paragraph they didn't
    // write, and a popular article produces dozens of overlapping ones.
    const notes = [ev({ tags: [['a', '30023:pk:slug']] })];
    expect(filterFeedHighlights(notes)).toEqual([]);
  });

  it('keeps a highlight of an external page', () => {
    // Nothing in the app can render that page, so the passage IS the post.
    const notes = [ev({ tags: [['r', 'https://example.com/x']] })];
    expect(filterFeedHighlights(notes)).toHaveLength(1);
  });

  it('drops an unattributable highlight', () => {
    expect(filterFeedHighlights([ev({ tags: [] })])).toEqual([]);
  });

  it('leaves every other kind alone', () => {
    const notes = [ev({ kind: 1, tags: [] }), ev({ kind: 30023, tags: [] })];
    expect(filterFeedHighlights(notes)).toHaveLength(2);
  });
});

describe('articleCoordinate', () => {
  it('builds kind:pubkey:d', () => {
    expect(articleCoordinate(ARTICLE)).toBe(`30023:${'b'.repeat(64)}:my-post`);
  });

  it('tolerates a missing d tag', () => {
    expect(articleCoordinate({ ...ARTICLE, tags: [] })).toBe(`30023:${'b'.repeat(64)}:`);
  });
});

describe('fetchArticleHighlights', () => {
  it('queries by coordinate and by event id, since clients differ', async () => {
    await fetchArticleHighlights(ARTICLE);
    const [filters] = mocks.querySocial.mock.calls[0];
    expect(filters[0]['#a']).toEqual([articleCoordinate(ARTICLE)]);
    expect(filters[1]['#e']).toEqual(['article-1']);
  });

  it('keeps only highlights that really point at this article', async () => {
    // The shared coalescer hands over every consumer's events.
    mocks.querySocial.mockResolvedValue([
      ev({ id: 'mine', tags: [['a', articleCoordinate(ARTICLE)]] }),
      ev({ id: 'someone-elses', tags: [['a', '30023:other:post']] }),
      ev({ id: 'not-a-highlight', kind: 1, tags: [['a', articleCoordinate(ARTICLE)]] }),
    ]);
    const result = await fetchArticleHighlights(ARTICLE);
    expect(result.map((event) => event.id)).toEqual(['mine']);
  });

  it('dedupes the same highlight arriving from every relay', async () => {
    const one = ev({ id: 'same', tags: [['e', 'article-1']] });
    mocks.querySocial.mockResolvedValue([one, { ...one }]);
    expect(await fetchArticleHighlights(ARTICLE)).toHaveLength(1);
  });
});

describe('highlightRuns', () => {
  it('merges identical passages and counts who marked them', () => {
    const runs = highlightRuns([
      ev({ id: '1', pubkey: 'a'.repeat(64), content: 'the same sentence' }),
      ev({ id: '2', pubkey: 'c'.repeat(64), content: 'the same sentence' }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].pubkeys).toHaveLength(2);
  });

  it('normalises whitespace, since clients differ on trailing newlines', () => {
    const runs = highlightRuns([
      ev({ id: '1', content: 'one  two\nthree' }),
      ev({ id: '2', pubkey: 'c'.repeat(64), content: ' one two three ' }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].text).toBe('one two three');
  });

  it('counts a person once even if they highlighted twice', () => {
    const runs = highlightRuns([
      ev({ id: '1', content: 'the same sentence' }),
      ev({ id: '2', content: 'the same sentence' }),
    ]);
    expect(runs[0].pubkeys).toHaveLength(1);
  });

  it('skips passages too short to match anything meaningful', () => {
    expect(highlightRuns([ev({ content: 'the' })])).toEqual([]);
  });

  it('puts longer passages first so nesting marks up correctly', () => {
    // Marking the inner one first splits the outer, which then never
    // matches at all.
    const runs = highlightRuns([
      ev({ id: '1', content: 'a short piece' }),
      ev({ id: '2', content: 'a short piece inside a much longer passage' }),
    ]);
    expect(runs[0].text).toContain('much longer');
  });
});
