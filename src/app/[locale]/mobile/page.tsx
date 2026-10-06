import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { pageLocale, type LocaleParams } from '@/i18n/page-locale';
import { tourJsonLd, tourMetadata, type Tour } from '@/utils/seo/showcase';
import MobileShowcase from './MobileShowcase';

const TOUR: Tour = {
  page: 'mobile',
  shots: [
    { path: '/pictures-for-posts/mobile-server-and-channels-view.png', nameKey: 'seo.mobile.shots.channels', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png', nameKey: 'seo.mobile.shots.voice', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-login-modal.png', nameKey: 'seo.mobile.shots.login', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-own-profile-view.png', nameKey: 'seo.mobile.shots.profile', width: 720, height: 1600 },
  ],
  ogImage: { url: '/pictures-for-posts/mobile-showcase-readme.png', width: 3320, height: 1840 },
  twitterImage: '/pictures-for-posts/mobile-showcase-readme.png',
  keywords: [
    'mobile Discord alternative', 'Nostr mobile chat', 'mobile group chat app', 'NIP-29 mobile',
    'NIP-46 bunker mobile', 'Amber signer', 'mobile voice channels', 'PWA group chat',
    'crypto chat app', 'Web of Trust mobile', 'self-hosted Discord mobile',
  ],
};

export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = await pageLocale(params);
  return tourMetadata(TOUR, await getTranslations({ locale }), locale);
}

export default async function MobilePage({ params }: LocaleParams) {
  const locale = await pageLocale(params);
  const jsonLd = tourJsonLd(TOUR, await getTranslations({ locale }), locale);
  return (
    <IntlScope scope="showcase">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <MobileShowcase />
    </IntlScope>
  );
}
