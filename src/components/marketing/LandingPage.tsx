'use client';

import { useState } from 'react';
// Note: do NOT auto-redirect logged-in visitors to /app here.
// The landing page must remain reachable from /app and via direct URL,
// even when a session exists in localStorage.
import { useRouter } from '@/i18n/navigation';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import Navbar from './site/Navbar';
import ShootingStars from '../common/ShootingStars';
import Footer from './site/Footer';
import { useTranslations } from 'next-intl';
import { guidePath } from '@/utils/guides/guide-urls';
import CtaSection from './landing/CtaSection';
import DemoVideoSection from './landing/DemoVideoSection';
import FaqSection from './landing/FaqSection';
import FeaturesSection from './landing/FeaturesSection';
import LandingHero from './landing/LandingHero';
import LearnSection from './landing/LearnSection';
import PreviewSection from './landing/PreviewSection';
import RelayPulse from './landing/RelayPulse';
import RevealSection from './landing/RevealSection';
import RoadmapSection from './landing/RoadmapSection';
import StackSection from './landing/StackSection';
import StepsSection from './landing/StepsSection';

/**
 * The marketing landing page. Each section is its own component in
 * `./landing/` and owns its scroll reveal; this file keeps the page order,
 * the navigate-to-app state, and the post-quantum section (whose partner
 * names are the page's two exempt brand strings in the i18n baseline).
 */
export default function LandingPage() {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);
  const t = useTranslations();
  const launch = () => router.push('/app');

  const handleLoginSuccess = () => {
    setIsNavigating(true);
    router.push('/app');
  };

  if (isNavigating) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <div className="flex flex-col items-center gap-3">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
      <Navbar onLoginSuccess={handleLoginSuccess} />
      <LandingHero onLaunch={launch} />
      <DemoVideoSection />
      <RelayPulse />
      <PreviewSection onLaunch={launch} />
      <FeaturesSection />
      <StepsSection />
      <RoadmapSection />
      <LearnSection />
      <StackSection />
      <CtaSection onLaunch={launch} />
      <FaqSection />

      {/* Post-quantum messages: joint work with Nostr WoT + QuantaKrypto.
          This copy used to be written as in-development because DMs were still
          NIP-04. That shipped: DMs are gift-wrapped by default and carry a
          post-quantum seal when both sides advertise keys, so `pqc.status` now
          says so. The claim is conditional on purpose: a signer without
          post-quantum support still sends classic NIP-44, and saying otherwise
          would badge an unprotected message as protected. */}
      <RevealSection id="post-quantum" className="py-24 px-6 border-t border-lc-border">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.pqc.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg mb-4">{t('marketing.pqc.subtitle')}</p>
          <p className="text-sm text-lc-muted/80 mb-12">{t('marketing.pqc.status')}</p>

          <p className="text-xs uppercase tracking-widest text-lc-muted mb-6">
            {t('marketing.pqc.collab')}
          </p>
          <div className="grid sm:grid-cols-2 gap-4 text-left">
            {/* Both marks are monochrome white-on-transparent, which is the sanctioned
                on-dark treatment for each brand and keeps the pair visually consistent.
                The QuantaKrypto colour mark is not usable here: one of its nodes is
                #0E1626, which disappears against lc-black. `alt` is empty on purpose:
                the organisation name sits right beside it, so a screen reader would
                otherwise announce it twice. */}
            <a
              href="https://nostr-wot.com"
              target="_blank"
              rel="noopener noreferrer"
              className="lc-card p-6 hover:border-lc-green transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <Image src="/nostr-wot-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                <span className="font-semibold">Nostr WoT</span>
              </div>
              <span className="block text-sm text-lc-muted">{t('marketing.pqc.nostrwot.desc')}</span>
            </a>
            <a
              href="https://quantakrypto.com"
              target="_blank"
              rel="noopener noreferrer"
              className="lc-card p-6 hover:border-lc-green transition-colors"
            >
              <div className="flex items-center gap-3 mb-2">
                <Image src="/quantakrypto-mark.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                <span className="font-semibold">QuantaKrypto</span>
              </div>
              <span className="block text-sm text-lc-muted">{t('marketing.pqc.quantakrypto.desc')}</span>
            </a>
          </div>
          <div className="mt-10">
            <Link
              href={guidePath('quantum-safe-dms')}
              className="lc-pill lc-pill-secondary text-sm inline-flex items-center gap-2"
            >
              {t('marketing.pqc.guide')} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </RevealSection>

      <Footer />

      {/* Login modal removed: bridge-backed login lives at /app. */}
      </div>
    </main>
  );
}
