import { describe, expect, it } from 'vitest';
import type { Guide } from '@/services/guides/guides';
import { relatedGuideCards } from '@/utils/guides/related';

function guide(slug: string, title: string, description: string): Guide {
  return {
    slug,
    frontmatter: { title, description, heroComponent: 'vesta', publishedAt: '2026-01-01', updatedAt: '2026-01-01', tags: [] },
    content: '',
  } as Guide;
}

describe('related guide cards', () => {
  it('keeps the given order and lets an editor note replace the description', () => {
    const cards = relatedGuideCards(
      [{ slug: 'a', note: 'why this one' }, { slug: 'b' }],
      [guide('a', 'A', 'about a'), guide('b', 'B', 'about b')],
    );
    expect(cards).toEqual([
      { slug: 'a', title: 'A', subtitle: 'why this one', hero: 'vesta' },
      { slug: 'b', title: 'B', subtitle: 'about b', hero: 'vesta' },
    ]);
  });

  it('leaves out a guide that could not be read', () => {
    expect(relatedGuideCards([{ slug: 'gone' }, { slug: 'b' }], [null, guide('b', 'B', 'about b')]).map((c) => c.slug)).toEqual(['b']);
    expect(relatedGuideCards([{ slug: 'gone' }], [null])).toEqual([]);
  });
});
