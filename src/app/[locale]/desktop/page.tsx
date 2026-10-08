import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { tourJsonLd, tourMetadata, type Tour } from '@/utils/seo/showcase';
import JsonLd from '@/components/seo/JsonLd';
import DesktopShowcase from './DesktopShowcase';

const TOUR: Tour = {
  page: 'desktop',
  shots: [
    { path: '/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png', nameKey: 'seo.desktop.shots.chat', width: 1470, height: 799 },
    { path: '/pictures-for-posts/desktop-forums-view.png', nameKey: 'seo.desktop.shots.publications', width: 1470, height: 799 },
    { path: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png', nameKey: 'seo.desktop.shots.voice', width: 1470, height: 799 },
  ],
  keywords: [
    'Discord alternative desktop', 'Nostr desktop chat', 'NIP-29 group chat', 'mediasoup SFU voice',
    'self-hosted Discord', 'Nostr publications', 'encrypted group DMs', 'Lightning zaps chat',
    'Web of Trust chat', 'open source Discord',
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return tourMetadata(TOUR, await getTranslations({ locale }), locale);
}

export default async function DesktopPage() {
  const locale = await getLocale();
  const jsonLd = tourJsonLd(TOUR, await getTranslations({ locale }), locale);
  return (
    <>
      <JsonLd data={jsonLd} />
      <DesktopShowcase />
    </>
  );
}
