import { describe, expect, it } from 'vitest';
import type { Metadata } from 'next';
import { translator } from '@tests/support/intl';
import { generateMetadata as featuresMetadata } from '@/app/[locale]/features/page';
import { generateMetadata as helpMetadata } from '@/app/[locale]/help/layout';
import { generateMetadata as localDataHelpMetadata } from '@/app/[locale]/help/local-data/page';
import { generateMetadata as desktopMetadata } from '@/app/[locale]/desktop/page';
import { generateMetadata as mobileMetadata } from '@/app/[locale]/mobile/page';
import { generateMetadata as mediaKitMetadata } from '@/app/[locale]/media-kit/page';
import { generateMetadata as appMetadata } from '@/app/[locale]/app/page';
import { generateMetadata as landingMetadata } from '@/app/[locale]/page';
import { generateMetadata as guidesMetadata } from '@/app/[locale]/guides/page';
import type { Locale } from '@/i18n';

const SITE = 'https://obelisk.ar';
const at = (locale: Locale) => ({ params: Promise.resolve({ locale }) });

type Load = (p: ReturnType<typeof at>) => Promise<Metadata>;

/** Every public page, its locale-free path, and whether it carries social cards. */
const PAGES: Array<[string, Load, string, boolean]> = [
  ['landing', landingMetadata, '/', false],
  ['features', featuresMetadata, '/features', true],
  ['help', helpMetadata, '/help', true],
  ['help: local data', localDataHelpMetadata, '/help/local-data', true],
  ['desktop', desktopMetadata, '/desktop', true],
  ['mobile', mobileMetadata, '/mobile', true],
  ['media kit', mediaKitMetadata, '/media-kit', false],
  ['app', appMetadata, '/app', false],
  ['guides', guidesMetadata, '/guides', false],
];

const local = (locale: Locale, path: string) =>
  locale === 'en' ? `${SITE}${path === '/' ? '' : path}` : `${SITE}/${locale}${path === '/' ? '' : path}`;

describe('public page SEO metadata', () => {
  it.each(PAGES)('%s: canonical in its own language, alternates for all three plus x-default', async (_n, load, path, social) => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const metadata = await load(at(locale));
      expect(metadata.alternates?.canonical, locale).toBe(local(locale, path));
      expect(metadata.alternates?.languages).toEqual({
        'en-US': local('en', path),
        'es-AR': local('es', path),
        'pt-BR': local('pt', path),
        'x-default': local('en', path),
      });
      if (social) {
        expect(metadata.openGraph?.images).toBeTruthy();
        expect(metadata.twitter?.images).toBeTruthy();
      }
    }
  });

  it('reads every title and description from the seo module, in the page language', async () => {
    for (const locale of ['en', 'es', 'pt'] as const) {
      const t = translator(locale);
      expect((await featuresMetadata(at(locale))).title).toBe(t('seo.features.title'));
      expect((await helpMetadata(at(locale))).description).toBe(t('seo.help.description'));
      expect((await localDataHelpMetadata(at(locale))).title).toBe(t('seo.helpLocalData.title'));
      expect((await desktopMetadata(at(locale))).title).toBe(t('seo.desktop.title'));
      expect((await mobileMetadata(at(locale))).description).toBe(t('seo.mobile.description'));
      expect((await mediaKitMetadata(at(locale))).title).toBe(t('seo.mediaKit.title'));
      expect((await guidesMetadata(at(locale))).title).toBe(t('seo.guides.title'));
    }
    // And they really differ: Spanish is not English with a new URL.
    expect((await helpMetadata(at('es'))).title).not.toBe((await helpMetadata(at('en'))).title);
  });

  it('names the page language in og:locale and the other two as alternates', async () => {
    const og = (await featuresMetadata(at('pt'))).openGraph as { locale?: string; alternateLocale?: string[] };
    expect(og.locale).toBe('pt_BR');
    expect(og.alternateLocale).toEqual(['en_US', 'es_AR']);
  });
});
