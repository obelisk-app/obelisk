import type { Metadata } from 'next';
import DesktopShowcase from './DesktopShowcase';

const SITE_URL = process.env.CORS_ORIGIN || 'https://obelisk.ar';

const SCREENSHOTS = [
  {
    path: '/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png',
    name: 'Group chat with member list on desktop',
    width: 1470,
    height: 799,
  },
  {
    path: '/pictures-for-posts/desktop-forums-view.png',
    name: 'Threaded NIP-29 forums on desktop',
    width: 1470,
    height: 799,
  },
  {
    path: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
    name: 'Large voice channel via SFU on desktop',
    width: 1470,
    height: 799,
  },
];

export const metadata: Metadata = {
  title: 'Obelisk Desktop — Discord alternative for the open Nostr stack',
  description:
    'A guided tour of Obelisk on desktop: a Nostr-powered Discord alternative with NIP-29 group chat, threaded forums, mediasoup SFU voice, encrypted DMs, and Lightning zaps. No email, no password — just your keys.',
  alternates: { canonical: '/desktop' },
  keywords: [
    'Discord alternative desktop',
    'Nostr desktop chat',
    'NIP-29 group chat',
    'mediasoup SFU voice',
    'self-hosted Discord',
    'Nostr forums',
    'encrypted group DMs',
    'Lightning zaps chat',
    'Web of Trust chat',
    'open source Discord',
  ],
  openGraph: {
    title: 'Obelisk Desktop — Discord alternative for the open Nostr stack',
    description:
      'A guided tour of Obelisk on desktop: NIP-29 group chat, threaded forums, mediasoup SFU voice, encrypted DMs and Lightning zaps.',
    url: `${SITE_URL}/desktop`,
    type: 'website',
    images: [
      {
        url: '/pictures-for-posts/desktop-large-voice-channel-with-sfu-peer-trasmission-test.png',
        width: 1470,
        height: 799,
        alt: 'Obelisk desktop — large voice channel with SFU test peer transmission',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Obelisk Desktop — Discord alternative for the open Nostr stack',
    description:
      'A desktop tour of Obelisk: NIP-29 group chat, forums, SFU voice, encrypted DMs and Lightning zaps. No email, no password.',
    images: ['/pictures-for-posts/dekstop-public-general-chat-view-with-member-list.png'],
  },
};

export default function DesktopPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ImageGallery',
    name: 'Obelisk on desktop — screenshot tour',
    description:
      'Screenshots of Obelisk, a Nostr-powered Discord alternative, captured in a desktop browser.',
    url: `${SITE_URL}/desktop`,
    image: SCREENSHOTS.map((s) => ({
      '@type': 'ImageObject',
      contentUrl: `${SITE_URL}${s.path}`,
      url: `${SITE_URL}${s.path}`,
      width: s.width,
      height: s.height,
      name: `Obelisk desktop — ${s.name}`,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <DesktopShowcase />
    </>
  );
}
