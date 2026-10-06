import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { standardPageMetadata } from '@/utils/seo/standard';
import HelpIndex from './HelpIndex';

/**
 * In the page, not the help layout: a layout's own title replaces the root
 * template for every page under it, and its card would be overridden by the
 * `opengraph-image.tsx` beside it.
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return standardPageMetadata(await getTranslations({ locale }), locale, 'help', '/help', {
    // Search terms, not copy (docs/i18n.md): they stay English.
    keywords: [
      'Obelisk help', 'Nostr chat help', 'Nostr login guide', 'NIP-29 community guide',
      'Nostr relay help', 'Bitcoin zaps guide',
    ],
  });
}

export default async function Page({ params }: LocaleParams) {
  await pageLocale(params);
  return <HelpIndex />;
}
