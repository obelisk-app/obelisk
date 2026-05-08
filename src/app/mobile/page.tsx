import type { Metadata } from 'next';
import MobileShowcase from './MobileShowcase';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

const SCREENSHOTS = [
  {
    path: '/pictures-for-posts/mobile-server-and-channels-view.png',
    name: 'Servers and channels on mobile',
    width: 720,
    height: 1600,
  },
  {
    path: '/pictures-for-posts/mobile-channel-view-with-sfu-test-peer-trasmission.png',
    name: 'Voice channel with video on mobile (SFU)',
    width: 720,
    height: 1600,
  },
  {
    path: '/pictures-for-posts/mobile-login-modal.png',
    name: 'Sign in with Nostr on mobile',
    width: 720,
    height: 1600,
  },
  {
    path: '/pictures-for-posts/mobile-own-profile-view.png',
    name: 'Your Nostr profile on mobile',
    width: 720,
    height: 1600,
  },
];

export const metadata: Metadata = {
  title: 'Obelisk Mobile — Discord-style group chat for your phone',
  description:
    'See Obelisk on mobile: a Nostr-powered Discord alternative with NIP-29 group chat, voice channels, encrypted DMs, and Lightning zaps. No email, no password — just your keys.',
  alternates: { canonical: '/mobile' },
  keywords: [
    'mobile Discord alternative',
    'Nostr mobile chat',
    'mobile group chat app',
    'NIP-29 mobile',
    'NIP-46 bunker mobile',
    'Amber signer',
    'mobile voice channels',
    'PWA group chat',
    'crypto chat app',
    'Web of Trust mobile',
    'self-hosted Discord mobile',
  ],
  openGraph: {
    title: 'Obelisk Mobile — Nostr group chat on your phone',
    description:
      'A guided tour of Obelisk on mobile: Nostr login, NIP-29 channels, voice with SFU, encrypted DMs and Lightning zaps.',
    url: `${SITE_URL}/mobile`,
    type: 'website',
    images: [
      {
        url: '/pictures-for-posts/mobile-server-and-channels-view.png',
        width: 720,
        height: 1600,
        alt: 'Obelisk mobile — servers, categorized channels, forum threads and voice indicator',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Obelisk Mobile — Nostr group chat on your phone',
    description:
      'A mobile tour of Obelisk: NIP-29 channels, voice, encrypted DMs and Lightning zaps. No email, no password.',
    images: ['/pictures-for-posts/mobile-server-and-channels-view.png'],
  },
};

export default function MobilePage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: 'Obelisk on mobile — screenshot tour',
    description:
      'Screenshots of Obelisk, a Nostr-powered Discord alternative, captured on a mobile device.',
    url: `${SITE_URL}/mobile`,
    image: SCREENSHOTS.map((s) => ({
      '@type': 'ImageObject',
      contentUrl: `${SITE_URL}${s.path}`,
      url: `${SITE_URL}${s.path}`,
      width: s.width,
      height: s.height,
      name: `Obelisk mobile — ${s.name}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <MobileShowcase />
    </>
  );
}
