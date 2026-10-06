import type { Metadata } from 'next';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { localizedAlternates } from '@/utils/seo/alternates';
import LandingPage from '@/components/marketing/LandingPage';

// Sister project (server-backed variant): https://classic.obelisk.ar

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return { alternates: localizedAlternates(locale, '/') };
}

export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return (
    <IntlScope scope="marketing">
      <LandingPage />
    </IntlScope>
  );
}
