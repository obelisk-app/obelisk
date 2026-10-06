import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { absoluteUrl, localizedAlternates, ogLocales } from '@/utils/seo/alternates';
import { OG_IMAGE } from '@/utils/seo/site';
import LocalDataHelp from '@/components/help/LocalDataHelp';

const PATH = '/help/local-data';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  const title = t('seo.helpLocalData.title');
  const description = t('seo.helpLocalData.description');
  return {
    title,
    description,
    alternates: localizedAlternates(locale, PATH),
    openGraph: {
      title,
      description,
      url: absoluteUrl(locale, PATH),
      siteName: 'Obelisk',
      ...ogLocales(locale),
      type: 'article',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, type: 'image/png', alt: t('seo.help.imageAlt') }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE] },
  };
}

/** `/help/local-data`: what the app keeps in the browser, why, and every way to remove it. */
export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return <LocalDataHelp />;
}
