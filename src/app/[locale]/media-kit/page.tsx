import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { absoluteUrl, localizedAlternates, ogLocales } from '@/utils/seo/alternates';
import MediaKit from './MediaKit';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return {
    title: t('seo.mediaKit.title'),
    description: t('seo.mediaKit.description'),
    alternates: localizedAlternates(locale, '/media-kit'),
    openGraph: {
      title: t('seo.mediaKit.ogTitle'),
      description: t('seo.mediaKit.ogDescription'),
      url: absoluteUrl(locale, '/media-kit'),
      ...ogLocales(locale),
      type: 'website',
    },
  };
}

export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return (
    <IntlScope scope="mediaKit">
      <MediaKit />
    </IntlScope>
  );
}
