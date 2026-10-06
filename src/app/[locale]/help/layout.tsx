import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { absoluteUrl, localizedAlternates, ogLocales } from '@/utils/seo/alternates';
import { OG_IMAGE } from '@/utils/seo/site';

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  const t = await getTranslations({ locale });
  return {
    title: t('seo.help.title'),
    description: t('seo.help.description'),
    alternates: localizedAlternates(locale, '/help'),
    // Search terms, not copy (docs/i18n.md): they stay English.
    keywords: [
      'Obelisk help', 'Nostr chat help', 'Nostr login guide', 'NIP-29 community guide',
      'Nostr relay help', 'Bitcoin zaps guide',
    ],
    openGraph: {
      title: t('seo.help.ogTitle'),
      description: t('seo.help.ogDescription'),
      url: absoluteUrl(locale, '/help'),
      siteName: 'Obelisk',
      ...ogLocales(locale),
      type: 'website',
      images: [{ url: OG_IMAGE, width: 1200, height: 630, type: 'image/png', alt: t('seo.help.imageAlt') }],
    },
    twitter: {
      card: 'summary_large_image',
      title: t('seo.help.twitterTitle'),
      description: t('seo.help.twitterDescription'),
      images: [OG_IMAGE],
    },
  };
}

export default function HelpLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="guides">{children}</IntlScope>;
}
