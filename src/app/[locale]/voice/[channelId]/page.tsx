import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { pageLocale } from '@/i18n/page-locale';
import { LazyVoiceRoom } from '@/app/[locale]/app/lazy-mounts';
import BridgeRoute from '@/components/BridgeRoute';
import { cardAlt, cardImage } from '@/utils/seo/og';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ channelId: string; locale: string }> };

/** A room: the voice tool's copy and card, at the room's own URL; out of search. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await pageLocale(params);
  const { channelId } = await params;
  const t = await getTranslations({ locale });
  const title = t('seo.voice.title');
  return noindexMetadata({
    locale,
    path: `/voice/${encodeURIComponent(decodeURIComponent(channelId))}`,
    title,
    description: t('seo.voice.description'),
    image: cardImage(locale, '/voice', cardAlt(t, renderedTitle(title))),
  });
}

export default async function VoiceChannelPage({ params }: Params) {
  const { channelId } = await params;
  // The provider is here, not in `voice/layout.tsx`: the `/voice` form
  // above this page does not use the bridge and ships without it.
  return (
    <BridgeRoute>
      <LazyVoiceRoom channelId={decodeURIComponent(channelId)} />
    </BridgeRoute>
  );
}
