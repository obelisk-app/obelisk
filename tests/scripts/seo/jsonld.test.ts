import { describe, expect, it } from 'vitest';
import { textValues, validateJsonLd } from '../../../scripts/seo/lib/jsonld';

const ctx = { '@context': 'https://schema.org' };

describe('the JSON-LD validator behind npm run seo:check', () => {
  it('rejects a wrong context, an unknown type and a node with no type', () => {
    expect(validateJsonLd({ '@context': 'http://schema.org', '@type': 'WebSite', name: 'x', url: 'https://a.b' }).errors.join()).toMatch(/@context/);
    expect(validateJsonLd({ ...ctx, '@type': 'Recipe', name: 'x' }).errors.join()).toMatch(/not one this validator knows/);
    expect(validateJsonLd({ ...ctx, '@graph': [{ name: 'x' }] }).errors.join()).toMatch(/no @type/);
  });

  it('requires what Google requires of an Article', () => {
    const errors = validateJsonLd({ ...ctx, '@type': 'Article', headline: 'x' }).errors.join('\n');
    for (const prop of ['image', 'datePublished', 'dateModified', 'author']) expect(errors).toContain(`"${prop}"`);
    expect(errors).toMatch(/inLanguage/);
  });

  it('rejects relative URLs, non-ISO dates, placeholders and out-of-order dates', () => {
    const errors = validateJsonLd({
      ...ctx, '@type': 'Article', headline: 'x', image: '/og.png', datePublished: '04/16/2026', dateModified: '2026-01-01',
      author: { '@type': 'Organization', name: 'undefined', url: 'https://a.b', logo: 'https://a.b/l.png' }, inLanguage: 'en',
    }).errors.join('\n');
    expect(errors).toMatch(/not an absolute URL: \/og\.png/);
    expect(errors).toMatch(/not an ISO 8601 date: 04\/16\/2026/);
    expect(errors).toMatch(/placeholder value "undefined"/);
  });

  it('checks breadcrumb positions and FAQ structure', () => {
    const crumbs = validateJsonLd({ ...ctx, '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 2, name: 'a', item: 'https://a.b' }] });
    expect(crumbs.errors.join()).toMatch(/position should be 1/);
    const faq = validateJsonLd({ ...ctx, '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: 'q', acceptedAnswer: { text: 'a' } }] });
    expect(faq.errors.join()).toMatch(/acceptedAnswer must be an Answer/);
  });

  it('collects the reader-facing strings, for the translation check', () => {
    expect(textValues({ name: 'A', url: 'https://a.b', nested: [{ description: 'B' }, { headline: 'C' }] })).toEqual(['A', 'B', 'C']);
  });
});
