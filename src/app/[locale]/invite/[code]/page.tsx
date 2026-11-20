import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';
import { ogImage } from '@/utils/seo/og';
import { encodeRelayShareCode } from '@/utils/relay-url/relay-share-link';
import { inviteLinkRelay } from '@/utils/relay/relay-invite';
import RelayInviteLanding from './RelayInviteLanding';

/** Request-specific CSP nonces require a fresh document. */
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ relay?: string | string[] }>;
};

/**
 * A relay invitation link (`docs/features/relay-invites.md`): keeps the code
 * and forwards to the app on the relay it belongs to. A doorway, so
 * `noindex`; its card is the relay's live card, which is what a chat preview
 * of the link should show.
 */
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const locale = await getLocale();
  const { code } = await params;
  const t = await getTranslations({ locale });
  const concord = code.startsWith('naddr1');
  const relay = concord ? null : inviteLinkRelay((await searchParams).relay);
  const title = t(concord ? 'seo.concordInvite.title' : 'seo.relayInvite.title');
  return noindexMetadata({
    locale,
    path: `/invite/${encodeURIComponent(code)}`,
    title,
    description: t(concord ? 'seo.concordInvite.description' : 'seo.relayInvite.description'),
    image: ogImage(t, locale, relay ? { live: 'relay', id: encodeRelayShareCode(relay) } : { page: 'app' }, renderedTitle(title)),
  });
}

export default async function Page({ params, searchParams }: Props) {
  const { code } = await params;
  const relay = inviteLinkRelay((await searchParams).relay);
  // The root layout already delivers `common`, the only module this page reads.
  return <RelayInviteLanding code={code} relay={relay} />;
}
