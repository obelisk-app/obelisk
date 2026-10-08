import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { standardPageMetadata } from '@/utils/seo/standard';
import MediaKit from './MediaKit';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'mediaKit');
}

export default async function Page() {
  return (
    <IntlScope scope="mediaKit">
      <MediaKit />
    </IntlScope>
  );
}
