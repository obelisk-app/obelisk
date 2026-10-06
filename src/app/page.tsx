import type { Metadata } from 'next';
import LandingPage from '@/components/marketing/LandingPage';

// Sister project (server-backed variant): https://classic.obelisk.ar

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

export default function Page() {
  return <LandingPage />;
}
