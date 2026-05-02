import type { Metadata } from 'next';
import LandingPage from '@/components/LandingPage';

const SITE_URL = process.env.CORS_ORIGIN || 'https://classic.obelisk.ar';

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
  openGraph: {
    url: SITE_URL,
    type: 'website',
  },
};

export default function Page() {
  return <LandingPage />;
}
