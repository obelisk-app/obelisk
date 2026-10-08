import type { ReactNode } from 'react';
import IntlScope from '@/i18n/IntlScope';
import Navbar from '@/components/marketing/site/Navbar';
import Footer from '@/components/marketing/site/Footer';

/** Shared public-site chrome; individual routes retain their content and metadata. */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <IntlScope scope="public">
      <div className="min-h-screen bg-lc-black appearance-bg lc-grid-bg">
        <Navbar />
        {children}
        <div className="relative z-10"><Footer /></div>
      </div>
    </IntlScope>
  );
}
