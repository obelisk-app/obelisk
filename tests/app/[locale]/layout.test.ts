import { describe, expect, it, vi } from 'vitest';
import { translator } from '@tests/support/intl';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter' }),
}));

import LocaleLayout, { generateMetadata } from '@/app/[locale]/layout';
import { siteJsonLd } from '@/utils/seo/site';

const at = (locale: 'en' | 'es' | 'pt') => ({ params: Promise.resolve({ locale }) });

describe('root social metadata', () => {
  it('a fallback card for pages with none of their own (a 404): site copy, the X account, the image from the file route', async () => {
    const metadata = await generateMetadata(at('pt'));
    expect(metadata.openGraph).toMatchObject({ title: translator('pt')('seo.site.title'), siteName: 'Obelisk' });
    // `[locale]/opengraph-image.tsx` supplies the image; naming one here would be overridden anyway.
    expect((metadata.openGraph as { images?: unknown }).images).toBeUndefined();
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', site: '@lacryptaar' });
  });

  it('follows the URL language rather than one baked-in default', async () => {
    const metadata = await generateMetadata(at('pt'));
    expect(metadata.description).toBe(translator('pt')('seo.site.description'));
    expect((metadata.openGraph as { locale?: string }).locale).toBe('pt_BR');
    expect((metadata.openGraph as { alternateLocale?: string[] }).alternateLocale).not.toContain('pt_BR');
  });

  it('sets no canonical, so no page inherits "/" as its own', async () => {
    const metadata = await generateMetadata(at('es'));
    expect(metadata.alternates).toBeUndefined();
  });

  it('writes the JSON-LD descriptions and inLanguage in the page language', () => {
    const graph = siteJsonLd(translator('es'), 'es')['@graph'] as Array<Record<string, unknown>>;
    const site = graph.find((n) => n['@type'] === 'WebSite')!;
    expect(site.inLanguage).toBe('es');
    expect(site.description).toBe(translator('es')('seo.site.jsonLd.websiteDescription'));
    expect(site.url).toBe('https://obelisk.ar/es');
    expect(site['@id']).toBe('https://obelisk.ar/es#website');
  });

  it('describes the site and its publisher on every page, and the app only on the landing page', () => {
    const graph = siteJsonLd(translator('en'), 'en')['@graph'] as Array<Record<string, unknown>>;
    expect(graph.map((n) => n['@type'])).toEqual(['WebSite', 'Organization']);
    const org = graph[1];
    expect(org).toMatchObject({ '@id': 'https://obelisk.ar/#organization', name: 'La Crypta', logo: 'https://obelisk.ar/lacrypta-logo.png' });
  });

  it('leaves indexing to each page: no index/follow tag, only Google preview allowances', async () => {
    const robots = (await generateMetadata(at('en'))).robots as Record<string, unknown>;
    expect(robots.index).toBeUndefined();
    expect(robots.follow).toBeUndefined();
    expect(robots.googleBot).toMatchObject({ 'max-image-preview': 'large' });
  });

  it('a segment that is not a language: English metadata (so its 404 has a title), and the layout 404s', async () => {
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: 'dev' }) });
    expect(metadata.description).toBe(translator('en')('seo.site.description'));
    await expect(LocaleLayout({ params: Promise.resolve({ locale: 'fr' }), children: null })).rejects.toThrow();
  });
});
