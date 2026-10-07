import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import type { MessageKey } from '@/i18n/keys';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { cardAlt, cardImage } from '@/utils/seo/og';
import RelayShareLanding from './RelayShareLanding';

/** Relays with their own share-link card, by URL: the copy is in `seo.relay.<brand>`. */
const RELAY_BRANDING: Record<string, 'laCrypta'> = {
  'wss://lacrypta-relay.obelisk.ar': 'laCrypta',
};

type Params = { params: Promise<{ code: string }> };

/**
 * A share link adds a relay and forwards to the app: a doorway, not a page
 * to find in search (`noindex, follow`). What matters is its card, so the
 * image is named here, at its public URL: the file convention would build
 * it from the internal route, `/en/r/...`, which only redirects.
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const { code } = await params;
  const t = await getTranslations({ locale });
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? RELAY_BRANDING[relayUrl] : undefined;
  const path = `/r/${encodeURIComponent(code)}`;
  const title = brand ? t(`seo.relay.${brand}.title` as MessageKey) : t('seo.relay.pageTitle');
  return noindexMetadata({
    locale,
    path,
    title,
    description: brand ? t(`seo.relay.${brand}.description` as MessageKey) : t('seo.relay.fallbackDescription'),
    image: cardImage(locale, path, cardAlt(t, renderedTitle(title))),
  });
}

export default async function Page({ params }: Params) {
  const { code } = await params;
  return <RelayShareLanding code={code} />;
}
