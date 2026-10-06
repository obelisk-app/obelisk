import type { Metadata } from 'next';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import GuidesIndexPage, { buildGuidesIndexMetadata } from '@/components/guides/GuidesIndexPage';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  return buildGuidesIndexMetadata(await pageLocale(params));
}

export default async function Page({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  return (
    <IntlScope scope="guides">
      <GuidesIndexPage locale={locale} />
    </IntlScope>
  );
}
