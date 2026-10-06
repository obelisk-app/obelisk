import { describe, expect, it, vi } from 'vitest';
import { translator } from '@tests/support/intl';

vi.mock('next/font/google', () => ({
  Inter: () => ({ className: 'inter' }),
}));

import { generateMetadata } from '@/app/[locale]/layout';
import { siteJsonLd } from '@/utils/seo/site';

const at = (locale: 'en' | 'es' | 'pt') => ({ params: Promise.resolve({ locale }) });

describe('root social metadata', () => {
  it('uses the static Open Graph image, with alt text in the page language', async () => {
    const metadata = await generateMetadata(at('pt'));
    expect(metadata.openGraph?.images).toEqual([{
      url: '/og/obelisk.png?v=2',
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: 'Obelisk - chat em grupo com identidade Nostr',
    }]);
    expect(metadata.twitter?.images).toEqual(['/og/obelisk.png?v=2']);
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
    expect(site.inLanguage).toBe('es-AR');
    expect(site.description).toBe(translator('es')('seo.site.jsonLd.websiteDescription'));
    expect(site.url).toBe('https://obelisk.ar/es');
  });

  it('rejects a locale we do not ship with a 404', async () => {
    await expect(generateMetadata({ params: Promise.resolve({ locale: 'fr' }) })).rejects.toThrow();
  });
});
