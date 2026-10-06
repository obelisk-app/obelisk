import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardPageMetadata } from '@/utils/seo/standard';
import LocalDataHelp from '@/components/help/LocalDataHelp';

const PATH = '/help/local-data';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'helpLocalData', PATH);
}

/** `/help/local-data`: what the app keeps in the browser, why, and every way to remove it. */
export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return <LocalDataHelp />;
}
