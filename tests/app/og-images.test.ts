import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SITEMAP_PAGES } from '@/utils/seo/sitemap';

/**
 * Every indexed page has its own preview card: an `opengraph-image.tsx` in
 * its own route folder, which its metadata names (`cardImage`). A page
 * added to the sitemap without one fails here; `npm run seo:check` then
 * checks each rendered card is a unique 1200x630 PNG under 300 KB.
 */
describe('preview cards', () => {
  const route = (path: string) => join(process.cwd(), 'src/app/[locale]', path === '/' ? '' : path, 'opengraph-image.tsx');

  it.each(SITEMAP_PAGES.map((p) => p.path))('%s has its own opengraph-image route', (path) => {
    expect(existsSync(route(path)), route(path)).toBe(true);
  });

  it('so do the guides, the app shell, the voice tool and every shared-link page', () => {
    for (const path of ['/guides/[slug]', '/app', '/voice', '/r/[code]', '/notes/[id]', '/p/[id]', '/t/[tag]']) {
      expect(existsSync(route(path)), path).toBe(true);
    }
  });
});
