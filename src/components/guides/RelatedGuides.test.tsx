import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import RelatedGuides from './RelatedGuides';

vi.mock('@/lib/guides', () => ({
  readGuide: vi.fn(),
}));

async function renderAsync(node: Promise<React.ReactElement> | React.ReactElement) {
  const resolved = await node;
  return render(resolved);
}

describe('RelatedGuides', () => {
  beforeEach(async () => {
    const { readGuide } = await import('@/lib/guides');
    vi.mocked(readGuide).mockImplementation(async (_locale, slug) => {
      if (slug === 'missing') throw new Error('not found');
      const map: Record<string, { title: string; description: string }> = {
        'how-obelisk-works': { title: 'How Obelisk works', description: 'no-backend default' },
        'web-of-trust': { title: 'Bring your own relay', description: 'multi-relay default' },
      };
      return {
        slug,
        frontmatter: {
          title: map[slug]?.title ?? slug,
          description: map[slug]?.description ?? '',
          heroComponent: 'how-obelisk-works',
          publishedAt: '2026-01-01',
          updatedAt: '2026-01-01',
          tags: [],
        },
        content: '',
      };
    });
  });

  it('renders a card per item with note overriding description', async () => {
    const { getByTestId, getByText } = await renderAsync(
      RelatedGuides({
        locale: 'en',
        items: [
          { slug: 'how-obelisk-works', note: 'the no-backend architecture' },
          { slug: 'web-of-trust' },
        ],
      }),
    );
    expect(getByTestId('related-guide-how-obelisk-works')).toBeDefined();
    expect(getByText('the no-backend architecture')).toBeDefined();
    expect(getByText('multi-relay default')).toBeDefined();
  });

  it('skips items whose slug fails to resolve', async () => {
    const { queryByTestId, getByTestId } = await renderAsync(
      RelatedGuides({
        locale: 'en',
        items: [{ slug: 'missing' }, { slug: 'how-obelisk-works' }],
      }),
    );
    expect(queryByTestId('related-guide-missing')).toBeNull();
    expect(getByTestId('related-guide-how-obelisk-works')).toBeDefined();
  });

  it('returns null when no items resolve', async () => {
    const node = await RelatedGuides({ locale: 'en', items: [{ slug: 'missing' }] });
    expect(node).toBeNull();
  });

  it('uses the locale-specific heading', async () => {
    const { getByText } = await renderAsync(
      RelatedGuides({ locale: 'es', items: [{ slug: 'how-obelisk-works' }] }),
    );
    expect(getByText('Ver también')).toBeDefined();
  });
});
