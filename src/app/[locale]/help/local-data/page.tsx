import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';
import LocalDataHelp from '@/components/help/LocalDataHelp';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'helpLocalData');
}

/** `/help/local-data`: what the app keeps in the browser, why, and every way to remove it. */
export default async function Page() {
  return <LocalDataHelp />;
}
