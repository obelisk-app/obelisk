import { describe, expect, it } from 'vitest';
import type { Guide } from '@/services/guides/guides';
import { cardTitleSize, guideCardContent, guideCardText } from '@/utils/seo/card-layout';

describe('page card title size', () => {
  it('steps down as the title grows', () => {
    expect(cardTitleSize('x'.repeat(32))).toBe(66);
    expect(cardTitleSize('x'.repeat(33))).toBe(56);
    expect(cardTitleSize('x'.repeat(52))).toBe(56);
    expect(cardTitleSize('x'.repeat(80))).toBe(48);
    expect(cardTitleSize('x'.repeat(81))).toBe(40);
  });
});

describe('guide card text', () => {
  it('uses the largest type for a short title and keeps a description that fits', () => {
    expect(guideCardText('Short title', 'fits')).toEqual({ titleFontSize: 72, descFontSize: 28, description: 'fits' });
  });

  it('shrinks the title past 40 and 56 characters, and the description with it past 56', () => {
    expect(guideCardText('x'.repeat(41), '').titleFontSize).toBe(60);
    expect(guideCardText('x'.repeat(57), '')).toMatchObject({ titleFontSize: 52, descFontSize: 24 });
  });

  it('cuts a description that would not fit with an ellipsis, allowing more under a long title', () => {
    const long = 'd'.repeat(300);
    expect(guideCardText('Short', long).description).toBe(`${'d'.repeat(199)}…`);
    expect(guideCardText('x'.repeat(57), long).description).toBe(`${'d'.repeat(219)}…`);
    expect(guideCardText('Short', 'd'.repeat(200)).description).toBe('d'.repeat(200));
  });
});

describe('guide card content', () => {
  it('reads the title, the search description and the tags', () => {
    const guide = {
      slug: 'g',
      frontmatter: { title: 'T', description: 'plain', seoDescription: 'for search', heroComponent: 'vesta', tags: ['a'] },
      content: '',
    } as unknown as Guide;
    expect(guideCardContent(guide)).toEqual({ title: 'T', description: 'for search', tags: ['a'] });
  });

  it('falls back to the site name when the guide is missing', () => {
    expect(guideCardContent(null)).toEqual({ title: 'Obelisk', description: '', tags: [] });
  });
});
