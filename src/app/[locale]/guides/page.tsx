import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import GuidesIndexPage from '@/components/guides/listing/GuidesIndexPage';
import { guidePath } from '@/utils/guides/guide-urls';
import { standardPageMetadata } from '@/utils/seo/standard';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardPageMetadata(t, locale, 'guides', guidePath());
}

export default async function Page() {
  const locale = await getLocale();
  return (
    <IntlScope scope="guides">
      <GuidesIndexPage locale={locale} />
    </IntlScope>
  );
}
