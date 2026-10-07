import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { tourJsonLd, tourMetadata, type Tour } from '@/utils/seo/showcase';
import JsonLd from '@/components/seo/JsonLd';
import MobileShowcase from './MobileShowcase';

const TOUR: Tour = {
  page: 'mobile',
  shots: [
    { path: '/pictures-for-posts/mobile-server-and-channels-view.png', nameKey: 'seo.mobile.shots.channels', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png', nameKey: 'seo.mobile.shots.voice', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-login-modal.png', nameKey: 'seo.mobile.shots.login', width: 720, height: 1600 },
    { path: '/pictures-for-posts/mobile-own-profile-view.png', nameKey: 'seo.mobile.shots.profile', width: 720, height: 1600 },
  ],
  keywords: [
    'mobile Discord alternative', 'Nostr mobile chat', 'mobile group chat app', 'NIP-29 mobile',
    'NIP-46 bunker mobile', 'Amber signer', 'mobile voice channels', 'PWA group chat',
    'crypto chat app', 'Web of Trust mobile', 'self-hosted Discord mobile',
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return tourMetadata(TOUR, await getTranslations({ locale }), locale);
}

export default async function MobilePage() {
  const locale = await getLocale();
  const jsonLd = tourJsonLd(TOUR, await getTranslations({ locale }), locale);
  return (
    <IntlScope scope="showcase">
      <JsonLd data={jsonLd} />
      <MobileShowcase />
    </IntlScope>
  );
}
