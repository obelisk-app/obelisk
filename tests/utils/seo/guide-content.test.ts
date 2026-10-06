import { describe, expect, it } from 'vitest';
import { LOCALES } from '@/i18n';
import { listSlugs, readGuide } from '@/services/guides';
import { guideSeoText } from '@/utils/seo/guide';

/**
 * Every guide, in every language, as a search result shows it: a title of
 * 45 to 57 characters once the layout adds " · Obelisk", and a
 * description of 145 to 157 (the owner's windows). A new guide whose lede runs long needs a
 * `seoDescription` and a `seoTitle` written to fit. Dates are real ISO dates.
 */
describe('guide front matter fits a search result', () => {
  it('title, description and dates, for every guide in every language', async () => {
    const slugs = await listSlugs('en');
    expect(slugs.length).toBeGreaterThan(10);
    for (const locale of LOCALES) {
      for (const slug of slugs) {
        const { frontmatter } = await readGuide(locale, slug);
        const { title, description } = guideSeoText(frontmatter);
        const where = `${locale}/${slug}`;
        expect(`${title} · Obelisk`.length, `${where} title: ${title}`).toBeGreaterThanOrEqual(45);
        expect(`${title} · Obelisk`.length, `${where} title: ${title}`).toBeLessThanOrEqual(57);
        expect(description.length, `${where} description`).toBeGreaterThanOrEqual(145);
        expect(description.length, `${where} description`).toBeLessThanOrEqual(157);
        expect(frontmatter.publishedAt, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(frontmatter.updatedAt, where).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(frontmatter.updatedAt >= frontmatter.publishedAt, where).toBe(true);
      }
    }
  });
});
