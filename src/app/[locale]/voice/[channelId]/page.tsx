import IntlScope from '@/i18n/IntlScope';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import LazyVoiceRoom from '@/components/voice/room/LazyVoiceRoom';
import BridgeRoute from '@/components/common/BridgeRoute';
import { ogImage } from '@/utils/seo/og';
import { noindexMetadata, renderedTitle } from '@/utils/seo/page';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ channelId: string }> };

/** A room: the voice tool's copy and card, at the room's own URL; out of search. */
export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const locale = await getLocale();
  const { channelId } = await params;
  const t = await getTranslations({ locale });
  const title = t('seo.voice.title');
  return noindexMetadata({
    locale,
    path: `/voice/${encodeURIComponent(decodeURIComponent(channelId))}`,
    title,
    description: t('seo.voice.description'),
    image: ogImage(t, locale, { page: 'voice' }, renderedTitle(title)),
  });
}

export default async function VoiceChannelPage({ params }: Params) {
  const { channelId } = await params;
  // The provider is here, not in `voice/layout.tsx`: the `/voice` form
  // above this page does not use the bridge and ships without it.
  return (
    <IntlScope scope="voiceRoom">
      <BridgeRoute>
        <LazyVoiceRoom channelId={decodeURIComponent(channelId)} />
      </BridgeRoute>
    </IntlScope>
  );
}
