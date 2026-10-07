import { describe, expect, it } from 'vitest';
import { articleDate, articleExcerpt, articleMeta, readingMinutes } from '@/utils/social/article-meta';

describe('articleMeta', () => {
  it('reads the NIP-23 tags, preferring published_at over created_at', () => {
    const meta = articleMeta({
      created_at: 200,
      tags: [['title', 'T'], ['summary', 'S'], ['published_at', '100'], ['d', 'slug'], ['t', 'nostr'], ['t', '']],
    });
    expect(meta).toEqual({ title: 'T', summary: 'S', image: null, publishedAt: 100, identifier: 'slug', hashtags: ['nostr'] });
    expect(articleMeta({ created_at: 200, tags: [] }).publishedAt).toBe(200);
  });
});

describe('readingMinutes', () => {
  it('is at least one minute, at about 220 words a minute', () => {
    expect(readingMinutes('')).toBe(1);
    expect(readingMinutes('word '.repeat(660))).toBe(3);
  });
});

describe('articleDate', () => {
  it('formats a publication date in the app locale', () => {
    expect(articleDate('en', 1_700_000_000)).toMatch(/2023/);
  });
});

describe('articleExcerpt', () => {
  it('prefers the summary', () => {
    expect(articleExcerpt({ summary: 'S' }, '## Body')).toBe('S');
  });

  it('falls back to the body without markdown marks, cut at 220 characters', () => {
    expect(articleExcerpt({ summary: null }, '## Title\n**bold** [link](x)')).toBe(' Title\nbold linkx');
    expect(articleExcerpt({ summary: null }, 'a'.repeat(300))).toHaveLength(220);
  });
});
