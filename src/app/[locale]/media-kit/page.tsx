import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardPageMetadata } from '@/utils/seo/standard';
import MediaKit from './MediaKit';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'mediaKit', '/media-kit');
}

export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return (
    <IntlScope scope="mediaKit">
      <MediaKit />
    </IntlScope>
  );
}
