import type { Metadata } from 'next';
import MediaKit from './MediaKit';

export const metadata: Metadata = {
  title: 'Media Kit - Obelisk',
  description:
    'Press & media kit for Obelisk: logos, banners, icons, color tokens, copy and ready-to-embed HTML banners.',
  alternates: { canonical: '/media-kit' },
  openGraph: {
    title: 'Obelisk - Media Kit',
    description:
      'Logos, banners, icons, brand colors and embed snippets for Obelisk.',
    type: 'website',
  },
};

export default function Page() {
  return <MediaKit />;
}
