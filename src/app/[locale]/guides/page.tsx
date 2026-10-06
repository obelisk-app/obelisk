import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import GuidesIndexPage from '@/components/guides/GuidesIndexPage';
import { guidePath } from '@/utils/guides/guide-urls';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'guides', guidePath());
}

export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <IntlScope scope="guides">
      <GuidesIndexPage locale={locale} />
    </IntlScope>
  );
}
