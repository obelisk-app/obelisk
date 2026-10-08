import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Metadata } from 'next';
import { setRootLocale } from '@tests/support/root-params';
import { LOCALES, type Locale } from '@/i18n';
import { listSlugs } from '@/services/guides/guides';
import { SITEMAP_PAGES } from '@/utils/seo/sitemap';
import { SITE_URL } from '@/constants/seo/alternates';
import { OG_STATIC_DIR } from '@/constants/seo/og';
import { imageSize } from '../../scripts/seo/lib/image-size';

/**
 * The shape of the preview cards. A page names its card in its own
 * `generateMetadata` (`ogImage`, `src/utils/seo/og.ts`); there is no
 * `opengraph-image` file route anywhere. Every indexed page, in every
 * language, names its own 1200x630 PNG, and since none of them depends on
 * live data, that is a committed file under `public/og/cards/` (drawn by
 * `npm run snap-og`). The pages drawn from live data name the one live-card
 * route, `/og/<kind>/<id>`. `npm run seo:check` then fetches every card from
 * a running build.
 */

type Image = { url: string; width: number; height: number; type: string; alt: string };
type MetadataModule = { generateMetadata: (p?: { params: Promise<Record<string, string>> }) => Promise<Metadata> };

const APP = join(process.cwd(), 'src/app');
const PUBLIC = join(process.cwd(), 'public');

async function metadataOf(route: string, locale: Locale, params: Record<string, string> = {}): Promise<Metadata> {
  const siteFile = join(APP, '[locale]', '(site)', route, 'page.tsx');
  const file = existsSync(siteFile) ? siteFile : join(APP, '[locale]', route, 'page.tsx');
  const mod = (await import(/* @vite-ignore */ file)) as MetadataModule;
  setRootLocale(locale);
  return mod.generateMetadata({ params: Promise.resolve(params) });
}

function cardOf(m: Metadata): Image {
  const images = (m.openGraph as { images: Image[] }).images;
  expect(images).toHaveLength(1);
  expect((m.twitter as { images: Array<{ url: string }> }).images.map((i) => i.url)).toEqual([images[0].url]);
  return images[0];
}

function filesNamed(dir: string, re: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? filesNamed(join(dir, e.name), re) : re.test(e.name) ? [join(dir, e.name)] : []);
}

/** Every indexed page as (route folder, params): the sitemap's pages, then every guide. */
async function indexedPages(): Promise<Array<[string, Record<string, string>]>> {
  const slugs = await listSlugs('en');
  return [
    ...SITEMAP_PAGES.map((p): [string, Record<string, string>] => [p.path === '/' ? '' : p.path, {}]),
    ...slugs.map((slug): [string, Record<string, string>] => ['/guides/[slug]', { slug }]),
  ];
}

describe('preview cards', () => {
  it('have no opengraph-image or twitter-image file route: each page names its card in generateMetadata', () => {
    expect(filesNamed(APP, /^(opengraph|twitter)-image\./)).toEqual([]);
  });

  it('every indexed page names its own 1200x630 PNG file under public/og/cards, in all three languages', async () => {
    const seen = new Map<string, string>();
    for (const [route, params] of await indexedPages()) {
      for (const locale of LOCALES) {
        const where = `${locale} ${route || '/'} ${params.slug ?? ''}`;
        const card = cardOf(await metadataOf(route, locale, params));
        expect(card, where).toMatchObject({ width: 1200, height: 630, type: 'image/png' });
        expect(card.alt, where).toBeTruthy();
        expect(card.url.startsWith(`${SITE_URL}${OG_STATIC_DIR}/${locale}/`), `${where}: ${card.url}`).toBe(true);
        // The URL carries the card's version (`?v=`), so it can be cached for good.
        expect(card.url, where).toMatch(/\.png\?v=[0-9a-f]{16}$/);
        const file = join(PUBLIC, new URL(card.url).pathname);
        expect(existsSync(file), `${where}: ${file}`).toBe(true);
        expect(imageSize(readFileSync(file)), where).toEqual({ width: 1200, height: 630 });
        expect(seen.get(card.url), `${where} shares its card with ${seen.get(card.url)}`).toBeUndefined();
        seen.set(card.url, where);
      }
    }
    expect(seen.size).toBeGreaterThanOrEqual(3 * (SITEMAP_PAGES.length + 1));
    // Loads every page module and reads every guide: slow under a full parallel run.
  }, 90_000);

  it('a page drawn from live data names the one live-card route, in its language', async () => {
    expect(existsSync(join(APP, '[locale]/og/[kind]/[id]/route.ts'))).toBe(true);
    expect(cardOf(await metadataOf('/r/[code]', 'es', { code: 'lacrypta' })).url).toBe(`${SITE_URL}/es/og/relay/lacrypta`);
    expect(cardOf(await metadataOf('/t/[tag]', 'en', { tag: 'nostr' })).url).toBe(`${SITE_URL}/og/tag/nostr`);
  });
});
