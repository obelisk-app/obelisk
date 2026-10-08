import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { decodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { ogImage } from '@/utils/seo/og';
import { BRANDED_RELAYS } from '@/constants/seo/relay';
import RelayShareLanding from './RelayShareLanding';

type Params = { params: Promise<{ code: string }> };

/**
 * A share link adds a relay and forwards to the app: a doorway, not a page
 * to find in search (`noindex, follow`). What matters is its card, drawn on
 * request by the live-card route (`/og/relay/<code>`).
 */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const { code } = await params;
  const t = await getTranslations({ locale });
  const relayUrl = decodeRelayShareCode(code);
  const brand = relayUrl ? BRANDED_RELAYS[relayUrl]?.key : undefined;
  const path = `/r/${encodeURIComponent(code)}`;
  const title = brand ? t(`seo.relay.${brand}.title`) : t('seo.relay.pageTitle');
  return noindexMetadata({
    locale,
    path,
    title,
    description: brand ? t(`seo.relay.${brand}.description`) : t('seo.relay.fallbackDescription'),
    image: ogImage(t, locale, { live: 'relay', id: code }, renderedTitle(title)),
  });
}

export default async function Page({ params }: Params) {
  const { code } = await params;
  return <RelayShareLanding code={code} />;
}
