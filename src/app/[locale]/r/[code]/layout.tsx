import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale } from '@/i18n/page-locale';
import type { MessageKey } from '@/i18n/keys';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { localizedAlternates, ogLocales } from '@/utils/seo/alternates';

/** Relays with their own share-link card, by URL: the copy is in `seo.relay.<brand>`. */
const RELAY_BRANDING: Record<string, 'laCrypta'> = {
  'wss://lacrypta-relay.obelisk.ar': 'laCrypta',
};

type Params = { params: Promise<{ code: string; locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { code } = await params;
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? RELAY_BRANDING[relayUrl] : undefined;
  if (!brand) return { alternates: localizedAlternates(locale, `/r/${code}`) };
  const t = await getTranslations({ locale });
  const title = t(`seo.relay.${brand}.title` as MessageKey);
  const description = t(`seo.relay.${brand}.description` as MessageKey);
  return {
    title,
    description,
    alternates: localizedAlternates(locale, `/r/${code}`),
    openGraph: { ...ogLocales(locale), title, description },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** The share link joins a relay in the app, so it ships the app's modules. */
export default function RelayShareLayout({ children }: { children: ReactNode }) {
  return <IntlScope scope="app">{children}</IntlScope>;
}
