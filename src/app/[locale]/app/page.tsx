import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardNoindexMetadata } from '@/utils/seo/standard';
import AppGate from './AppGate';

/**
 * The chat itself: a login screen, then the signed-in shell, all drawn in
 * the browser, so a crawler sees an empty page. It stays out of search
 * (`noindex, follow`); the landing page is the one that ranks for Obelisk.
 * Its card still shows when someone pastes the link.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return standardNoindexMetadata(t, locale, 'app');
}

export default function AppPage() {
  return <AppGate />;
}
