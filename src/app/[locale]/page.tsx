import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardPageMetadata } from '@/utils/seo/standard';
import { webApplicationNode } from '@/utils/seo/jsonld';
import LandingPage from '@/components/marketing/LandingPage';
import JsonLd from '@/components/seo/JsonLd';

// Sister project (server-backed variant): https://classic.obelisk.ar

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return standardPageMetadata(await getTranslations({ locale }), locale, 'site', '/', { absoluteTitle: true });
}

export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return (
    <IntlScope scope="marketing">
      <JsonLd data={webApplicationNode(locale, t('seo.site.jsonLd.appDescription'))} />
      <LandingPage />
    </IntlScope>
  );
}
