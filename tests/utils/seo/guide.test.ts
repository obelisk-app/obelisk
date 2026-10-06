import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { validateJsonLd } from '../../../scripts/seo/lib/jsonld';
import { guideHero, guideImages, guideJsonLd, guideMetadata, guideSeoText, type GuideSeoFields } from '@/utils/seo/guide';
import { ORGANIZATION_ID } from '@/utils/seo/jsonld';

const fm: GuideSeoFields = {
  title: 'Vesta: settlements, trade, and dice nobody rolls',
  description: 'A long lede that runs well past what a search result shows. '.repeat(4),
  seoDescription: 'A short description for search results, about a settlement game on Nostr relays.',
  heroComponent: 'vesta',
  publishedAt: '2026-09-04',
  updatedAt: '2026-09-20',
  tags: ['games', 'vesta'],
};

describe('guide search text', () => {
  it('uses the seo fields when there are any, the plain ones otherwise', () => {
    expect(guideSeoText(fm)).toEqual({ title: fm.title, description: fm.seoDescription });
    expect(guideSeoText({ ...fm, seoTitle: 'Short', seoDescription: undefined })).toEqual({ title: 'Short', description: fm.description });
  });
});

describe('guide metadata', () => {
  const m = guideMetadata({ locale: 'es', slug: 'vesta', fm, t: translator('es') });

  it('dates the article from its front matter', () => {
    expect(m.openGraph).toMatchObject({ type: 'article', publishedTime: '2026-09-04', modifiedTime: '2026-09-20' });
  });

  it('describes it with the short description and shows its own card in its own language', () => {
    expect(m.description).toBe(fm.seoDescription);
    const [image] = (m.openGraph as { images: Array<{ url: string; width: number; height: number }> }).images;
    // The 1200x630 card, not the 2:1 hero that previews would crop.
    expect(image).toMatchObject({ url: 'https://obelisk.ar/es/guides/vesta/opengraph-image', width: 1200, height: 630 });
    expect(m.alternates?.canonical).toBe('https://obelisk.ar/es/guides/vesta');
  });

  it('a guide with no snapshot falls back to its generated card at the public URL', () => {
    expect(guideHero({ ...fm, heroComponent: 'none' }, 'pt', 'x', translator('pt')).url).toBe('https://obelisk.ar/pt/guides/x/opengraph-image');
  });
});

describe('guide JSON-LD', () => {
  const content = 'Text <Diagram name="swap-matrix" /> and <Shot name="games/vesta-board" />';
  const shots = { 'games/vesta-board': { width: 800, height: 500, altKey: 'guides.shot.alt.vestaBoard' as const } };
  const [article, breadcrumb] = guideJsonLd({ locale: 'pt', slug: 'vesta', fm, content, t: translator('pt'), shots, homeName: 'Obelisk', guidesName: 'Guias' });

  it('is a valid Article with front-matter dates, the page URL and language', () => {
    expect(validateJsonLd(article).errors).toEqual([]);
    expect(article).toMatchObject({
      '@type': 'Article',
      headline: fm.title,
      datePublished: '2026-09-04',
      dateModified: '2026-09-20',
      url: 'https://obelisk.ar/pt/guides/vesta',
      inLanguage: 'pt',
      publisher: { '@id': ORGANIZATION_ID },
      author: { '@id': ORGANIZATION_ID, name: 'La Crypta' },
    });
  });

  it('lists the hero, diagrams and screenshots, the drawn ones in the page language', () => {
    const urls = (article.image as Array<{ url: string }>).map((i) => i.url);
    expect(urls).toEqual([
      'https://obelisk.ar/og/guides/pt/vesta.png',
      'https://obelisk.ar/og/guides/pt/swap-matrix.png',
      'https://obelisk.ar/og/guides/games/vesta-board.png',
    ]);
    expect(guideImages('vesta', content, 'en', shots).map((i) => i.url)[0]).toBe('https://obelisk.ar/og/guides/vesta.png');
  });

  it('breadcrumbs home > guides > the guide', () => {
    expect(validateJsonLd(breadcrumb).errors).toEqual([]);
    expect(((breadcrumb as Record<string, unknown>).itemListElement as Array<{ item: string }>).map((i) => i.item)).toEqual([
      'https://obelisk.ar/pt', 'https://obelisk.ar/pt/guides', 'https://obelisk.ar/pt/guides/vesta',
    ]);
  });
});
