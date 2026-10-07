import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const drawn: Array<{ element: ReactElement; size: unknown }> = [];
vi.mock('next/og', () => ({
  ImageResponse: class {
    constructor(element: ReactElement, size: unknown) {
      drawn.push({ element, size });
    }
  },
}));

import OgImage from '@/app/[locale]/guides/[slug]/opengraph-image';
import { readGuide } from '@/services/guides/guides';
import { guideSeoText } from '@/utils/seo/guide';

async function card(locale: string, slug: string): Promise<{ html: string; size: unknown }> {
  drawn.length = 0;
  await OgImage({ params: Promise.resolve({ locale, slug }) });
  return { html: renderToStaticMarkup(drawn[0].element), size: drawn[0].size };
}

describe('a guide\'s preview card', () => {
  beforeEach(() => {
    drawn.length = 0;
  });

  it('carries the guide\'s title, search description, tags and section address at 1200x630', async () => {
    const guide = await readGuide('en', 'what-is-obelisk');
    const { html, size } = await card('en', 'what-is-obelisk');
    expect(size).toEqual({ width: 1200, height: 630 });
    expect(html).toContain(guide.frontmatter.title);
    expect(html).toContain(guideSeoText(guide.frontmatter).description);
    for (const tag of guide.frontmatter.tags.slice(0, 4)) expect(html).toContain(`#${tag}`);
    expect(html).toContain('obelisk.ar/guides');
  });

  it('is in the URL\'s language, footer included', async () => {
    const guide = await readGuide('es', 'what-is-obelisk');
    const { html } = await card('es', 'what-is-obelisk');
    expect(html).toContain(guide.frontmatter.title);
    expect(html).toContain('obelisk.ar/es/');
  });

  it('still draws a card for a guide that does not exist, and for an unknown language', async () => {
    const { html } = await card('xx', 'no-such-guide');
    expect(html).toContain('Obelisk');
    expect(html).toContain('obelisk.ar/guides');
  });
});
