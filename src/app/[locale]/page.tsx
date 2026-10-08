import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { standardPageMetadata } from '@/utils/seo/standard';
import { webApplicationNode } from '@/utils/seo/jsonld';
import LandingPage from '@/components/marketing/LandingPage';
import JsonLd from '@/components/seo/JsonLd';

// Sister project (server-backed variant): https://classic.obelisk.ar

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'landing', { absoluteTitle: true });
}

export default async function Page() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return (
    <IntlScope scope="marketing">
      <JsonLd data={webApplicationNode(locale, t('seo.site.jsonLd.appDescription'))} />
      <LandingPage />
    </IntlScope>
  );
}
