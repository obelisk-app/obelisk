import { describe, expect, it } from 'vitest';
import { translator } from '@tests/support/intl';
import { validateJsonLd } from '../../../scripts/seo/lib/jsonld';
import {
  ORGANIZATION_ID, breadcrumbJsonLd, collectionJsonLd, faqJsonLd, organizationNode, webApplicationNode, websiteId, websiteNode,
} from '@/utils/seo/jsonld';
import { siteJsonLd } from '@/utils/seo/site';
import { tourJsonLd, type Tour } from '@/utils/seo/showcase';

/** Each builder's output passes the same validator `npm run seo:check` runs on the built pages. */
function valid(data: unknown) {
  const report = validateJsonLd(data);
  expect(report.errors).toEqual([]);
  return report;
}

describe('JSON-LD builders: valid schema.org with what Google requires', () => {
  it('WebSite + Organization on every page, in the page language, one organization by @id', () => {
    const graph = valid(siteJsonLd(translator('pt'), 'pt'));
    expect(graph.types).toEqual(['WebSite', 'Organization']);
    expect(websiteNode('pt', 'x')).toMatchObject({ '@id': 'https://obelisk.ar/pt#website', url: 'https://obelisk.ar/pt', inLanguage: 'pt', publisher: { '@id': ORGANIZATION_ID } });
    expect(websiteId('en')).toBe('https://obelisk.ar/#website');
    expect(organizationNode()).toMatchObject({ name: 'La Crypta', url: 'https://lacrypta.ar', logo: 'https://obelisk.ar/lacrypta-logo.png' });
  });

  it('WebApplication: free, any browser, the landing page as its URL, no invented rating', () => {
    const app = webApplicationNode('es', 'Una app.');
    const report = valid(app);
    expect(app).toMatchObject({ '@type': 'WebApplication', url: 'https://obelisk.ar/es', inLanguage: 'es', offers: { price: '0', priceCurrency: 'USD' } });
    expect(app).not.toHaveProperty('aggregateRating');
    expect(report.notes.join(' ')).toMatch(/not eligible/);
  });

  it('FAQPage: one Question per item, each with its Answer, text as given', () => {
    const faq = faqJsonLd([{ question: '¿Qué?', answer: 'Esto.' }, { question: '¿Y?', answer: 'Aquello.' }]);
    valid(faq);
    expect(faq.mainEntity).toEqual([
      { '@type': 'Question', name: '¿Qué?', acceptedAnswer: { '@type': 'Answer', text: 'Esto.' } },
      { '@type': 'Question', name: '¿Y?', acceptedAnswer: { '@type': 'Answer', text: 'Aquello.' } },
    ]);
  });

  it('BreadcrumbList: positions from 1, absolute URLs', () => {
    const crumbs = breadcrumbJsonLd([{ name: 'Obelisk', url: 'https://obelisk.ar/es' }, { name: 'Guías', url: 'https://obelisk.ar/es/guides' }]);
    valid(crumbs);
    expect((crumbs.itemListElement as Array<{ position: number }>).map((i) => i.position)).toEqual([1, 2]);
  });

  it('CollectionPage with its ItemList, part of the language\'s WebSite', () => {
    const page = collectionJsonLd({ locale: 'en', url: 'https://obelisk.ar/guides', name: 'Guides', description: 'All of them.', items: [{ name: 'A', url: 'https://obelisk.ar/guides/a' }] });
    valid(page);
    expect(page).toMatchObject({ inLanguage: 'en', isPartOf: { '@id': 'https://obelisk.ar/#website' } });
  });

  it('ImageGallery for the screenshot tours, in the page language', () => {
    const tour: Tour = { page: 'mobile', shots: [{ path: '/a.png', nameKey: 'seo.mobile.shots.login', width: 720, height: 1600 }], keywords: [] };
    const gallery = tourJsonLd(tour, translator('es'), 'es');
    valid(gallery);
    expect(gallery).toMatchObject({ url: 'https://obelisk.ar/es/mobile', inLanguage: 'es' });
  });
});
