import { describe, it, expect } from 'vitest';
import { listSlugs, readGuide } from './guides';
import { HERO_REGISTRY } from '@/components/guides/svg';
import { HERO_ASSET_META } from '@/components/guides/svg/asset-meta';
import { SHOT_META } from '@/components/guides/Shot';
import { CLIP_META } from '@/components/guides/Clip';

/**
 * The shipped guides, checked against the components they name.
 *
 * A guide referencing a hero, screenshot or sibling guide that does not exist
 * fails silently at runtime — the hero renders as nothing, the image 404s, the
 * "see also" card quietly disappears. None of that shows up in a build, so it
 * shows up here instead.
 */
const HERO_RE = /<SvgHero\s+[^>]*name=["']([^"']+)["']/g;
const SHOT_RE = /<Shot\s+[^>]*name=["']([^"']+)["']/g;
const CLIP_RE = /<Clip\s+[^>]*name=["']([^"']+)["']/g;
const RELATED_RE = /slug:\s*["']([^"']+)["']/g;

describe('shipped guides', () => {
  it('has the same slugs in every locale', async () => {
    const [en, es, pt] = await Promise.all([listSlugs('en'), listSlugs('es'), listSlugs('pt')]);
    expect(es).toEqual(en);
    expect(pt).toEqual(en);
    expect(en.length).toBeGreaterThan(0);
  });

  it('names a hero component that exists, with alt text for the snapshot', async () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const slug of await listSlugs(locale)) {
        const { frontmatter } = await readGuide(locale, slug);
        expect(HERO_REGISTRY[frontmatter.heroComponent], `${locale}/${slug}`).toBeTruthy();
        expect(HERO_ASSET_META[frontmatter.heroComponent], `${locale}/${slug}`).toBeTruthy();
      }
    }
  });

  it('carries the frontmatter the article page and the cards read', async () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      for (const slug of await listSlugs(locale)) {
        const { frontmatter: fm } = await readGuide(locale, slug);
        expect(fm.title?.length, `${locale}/${slug} title`).toBeGreaterThan(0);
        expect(fm.description?.length, `${locale}/${slug} description`).toBeGreaterThan(40);
        expect(fm.publishedAt, `${locale}/${slug} publishedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(fm.updatedAt, `${locale}/${slug} updatedAt`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Array.isArray(fm.tags) && fm.tags.length > 0, `${locale}/${slug} tags`).toBe(true);
      }
    }
  });

  it('only references heroes, screenshots, clips and sibling guides that exist', async () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const slugs = await listSlugs(locale);
      for (const slug of slugs) {
        const { content } = await readGuide(locale, slug);
        for (const m of content.matchAll(HERO_RE)) {
          expect(HERO_REGISTRY[m[1]], `${locale}/${slug} → hero ${m[1]}`).toBeTruthy();
        }
        for (const m of content.matchAll(SHOT_RE)) {
          expect(SHOT_META[m[1]], `${locale}/${slug} → shot ${m[1]}`).toBeTruthy();
        }
        for (const m of content.matchAll(CLIP_RE)) {
          expect(CLIP_META[m[1]], `${locale}/${slug} → clip ${m[1]}`).toBeTruthy();
        }
        for (const m of content.matchAll(RELATED_RE)) {
          expect(slugs.includes(m[1]), `${locale}/${slug} → related ${m[1]}`).toBe(true);
        }
      }
    }
  });

  it('ships a guide for every game in the picker', async () => {
    const slugs = await listSlugs('en');
    for (const game of ['chain-reaction', 'vesta', 'stacker']) {
      expect(slugs.includes(game), `no guide for ${game}`).toBe(true);
    }
  });
});
