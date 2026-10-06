import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardNoindexMetadata } from '@/utils/seo/standard';
import AppGate from './AppGate';

/**
 * The chat itself: a login screen, then the signed-in shell, all drawn in
 * the browser, so a crawler sees an empty page. It stays out of search
 * (`noindex, follow`); the landing page is the one that ranks for Obelisk.
 * Its card still shows when someone pastes the link.
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return standardNoindexMetadata(t, locale, 'app', '/app');
}

export default function AppPage() {
  return <AppGate />;
}
