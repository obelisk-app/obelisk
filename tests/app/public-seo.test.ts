import { describe, expect, it } from 'vitest';
import type { Metadata } from 'next';
import { translator } from '@tests/support/intl';
import { generateMetadata as featuresMetadata } from '@/app/[locale]/features/page';
import { generateMetadata as helpMetadata } from '@/app/[locale]/help/page';
import { generateMetadata as localDataHelpMetadata } from '@/app/[locale]/help/local-data/page';
import { generateMetadata as desktopMetadata } from '@/app/[locale]/desktop/page';
import { generateMetadata as mobileMetadata } from '@/app/[locale]/mobile/page';
import { generateMetadata as mediaKitMetadata } from '@/app/[locale]/media-kit/page';
import { generateMetadata as appMetadata } from '@/app/[locale]/app/page';
import { generateMetadata as landingMetadata } from '@/app/[locale]/page';
import { generateMetadata as guidesMetadata } from '@/app/[locale]/guides/page';
import { generateMetadata as guideMetadata } from '@/app/[locale]/guides/[slug]/page';
import { generateMetadata as voiceMetadata } from '@/app/[locale]/voice/page';
import { generateMetadata as relayShareMetadata } from '@/app/[locale]/r/[code]/page';
import { generateMetadata as notFoundMetadata } from '@/app/[locale]/not-found';
import type { Locale } from '@/i18n';
import { setRootLocale } from '@tests/support/root-params';

const SITE = 'https://obelisk.ar';
type Load = () => Promise<Metadata>;

/** A page's metadata for a request whose `[locale]` segment is `locale`. */
const at = (locale: Locale, load: Load) => {
  setRootLocale(locale);
  return load();
};

/** Every indexed page and its locale-free path. */
const PAGES: Array<[string, Load, string]> = [
  ['landing', landingMetadata, '/'],
  ['features', featuresMetadata, '/features'],
  ['help', helpMetadata, '/help'],
  ['help: local data', localDataHelpMetadata, '/help/local-data'],
  ['desktop', desktopMetadata, '/desktop'],
  ['mobile', mobileMetadata, '/mobile'],
  ['media kit', mediaKitMetadata, '/media-kit'],
  ['guides', guidesMetadata, '/guides'],
  ['a guide', () => guideMetadata({ params: Promise.resolve({ slug: 'vesta' }) }), '/guides/vesta'],
];

const local = (locale: Locale, path: string) =>
  locale === 'en' ? `${SITE}${path === '/' ? '' : path}` : `${SITE}/${locale}${path === '/' ? '' : path}`;

const og = (m: Metadata) => m.openGraph as Record<string, unknown>;

describe('indexed pages: one complete set of tags each', () => {
  it.each(PAGES)('%s: canonical in its own language, plain-language hreflang plus x-default', async (_n, load, path) => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const metadata = await at(locale, load);
      expect(metadata.alternates?.canonical, locale).toBe(local(locale, path));
      expect(metadata.alternates?.languages).toEqual({
        en: local('en', path),
        es: local('es', path),
        pt: local('pt', path),
        'x-default': local('en', path),
      });
      expect(metadata.robots, 'an indexed page sets no robots of its own').toBeUndefined();
    }
  });

  it.each(PAGES)('%s: og:url is the canonical, with site name, image and Twitter card', async (_n, load) => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const metadata = await at(locale, load);
      expect(og(metadata).url).toBe(metadata.alternates?.canonical);
      expect(og(metadata).siteName).toBe('Obelisk');
      const [image] = og(metadata).images as Array<{ url: string; width: number; height: number; alt: string }>;
      expect(image.url).toMatch(/^https:\/\/obelisk\.ar\//);
      expect(image.width).toBeGreaterThan(0);
      expect(image.alt).toBeTruthy();
      expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' });
      expect((metadata.twitter as { images: unknown[] }).images).toHaveLength(1);
    }
  });

  it.each(PAGES)('%s: title 45-57 and description 145-157 characters as rendered, the same on the card', async (_n, load) => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const m = await at(locale, load);
      const rendered = typeof m.title === 'string' ? `${m.title} · Obelisk` : (m.title as { absolute: string }).absolute;
      expect(rendered.length, `${locale}: ${rendered}`).toBeGreaterThanOrEqual(45);
      expect(rendered.length, `${locale}: ${rendered}`).toBeLessThanOrEqual(57);
      expect(String(m.description).length, `${locale}: ${m.description}`).toBeGreaterThanOrEqual(145);
      expect(String(m.description).length, `${locale}: ${m.description}`).toBeLessThanOrEqual(157);
      expect(og(m).title).toBe(rendered);
      expect(og(m).description).toBe(m.description);
      expect(m.twitter).toMatchObject({ title: rendered, description: m.description });
      const [image] = og(m).images as Array<{ url: string; width: number; height: number; type: string }>;
      expect(image).toMatchObject({ width: 1200, height: 630, type: 'image/png' });
      expect(image.url).toMatch(new RegExp(`^${SITE}/og/cards/${locale}/.+\\.png\\?v=[0-9a-f]{16}$`));
    }
  });

  it('reads every title and description from the seo module, in the page language', async () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const t = translator(locale);
      expect((await at(locale, featuresMetadata)).title).toBe(t('seo.features.title'));
      expect((await at(locale, helpMetadata)).description).toBe(t('seo.help.description'));
      expect((await at(locale, localDataHelpMetadata)).title).toBe(t('seo.helpLocalData.title'));
      expect((await at(locale, desktopMetadata)).title).toBe(t('seo.desktop.title'));
      expect((await at(locale, mobileMetadata)).description).toBe(t('seo.mobile.description'));
      expect((await at(locale, mediaKitMetadata)).title).toBe(t('seo.mediaKit.title'));
      expect((await at(locale, guidesMetadata)).title).toBe(t('seo.guides.title'));
      expect((await at(locale, landingMetadata)).title).toEqual({ absolute: t('seo.site.title') });
    }
    expect((await at('es', helpMetadata)).title).not.toBe((await at('en', helpMetadata)).title);
  });

  it('names the page language in og:locale and the other two as alternates', async () => {
    const graph = og(await at('pt', featuresMetadata));
    expect(graph.locale).toBe('pt_BR');
    expect(graph.alternateLocale).toEqual(['en_US', 'es_AR']);
  });
});

describe('pages kept out of search: noindex, follow, and still a card', () => {
  it('the app shell', async () => {
    const metadata = await at('es', appMetadata);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates).toBeUndefined();
    expect(og(metadata).url).toBe(`${SITE}/es/app`);
    expect(metadata.title).toBe(translator('es')('seo.app.title'));
  });

  it('the voice room and its form', async () => {
    const metadata = await at('pt', voiceMetadata);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.title).toBe(translator('pt')('seo.voice.title'));
  });

  it('a relay share link: its card from the live-card route at the public URL, never the internal /en/ one', async () => {
    for (const locale of ['en', 'es'] as const) {
      setRootLocale(locale);
      const metadata = await relayShareMetadata({ params: Promise.resolve({ code: 'lacrypta' }) });
      expect(metadata.robots).toEqual({ index: false, follow: true });
      const [image] = og(metadata).images as Array<{ url: string }>;
      expect(image.url).toBe(local(locale, '/og/relay/lacrypta'));
      expect(image.url).not.toContain('/en/');
      expect(og(metadata).url).toBe(local(locale, '/r/lacrypta'));
    }
  });

  it('an unbranded share link gets its own title, not the home page title', async () => {
    setRootLocale('en');
    const metadata = await relayShareMetadata({ params: Promise.resolve({ code: 'nonsense' }) });
    expect(metadata.title).toBe(translator('en')('seo.relay.pageTitle'));
  });

  it('the 404 names itself in the URL language and says noindex', async () => {
    setRootLocale('es');
    const es = await notFoundMetadata();
    expect(es.title).toBe(translator('es')('seo.notFound.title'));
    expect(es.robots).toEqual({ index: false, follow: true });
    setRootLocale('fr');
    const unknown = await notFoundMetadata();
    expect(unknown.title).toBe(translator('en')('seo.notFound.title'));
  });
});
