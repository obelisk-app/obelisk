import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';
import HelpIndex from './HelpIndex';

/**
 * In the page, not the help layout: a layout's own title replaces the root
 * template for every page under it.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'help', {
    // Search terms, not copy (docs/i18n.md): they stay English.
    keywords: [
      'Obelisk help', 'Nostr chat help', 'Nostr login guide', 'NIP-29 community guide',
      'Nostr relay help', 'Bitcoin zaps guide',
    ],
  });
}

export default async function Page() {
  return <HelpIndex />;
}
