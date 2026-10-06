import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { localizedAlternates } from '@/utils/seo/alternates';
import AppGate from './AppGate';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return {
    title: t('seo.app.title'),
    description: t('seo.app.description'),
    alternates: localizedAlternates(locale, '/app'),
  };
}

export default function AppPage() {
  return <AppGate />;
}
