'use client';

import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import Stack from '@/components/ui/layout/Stack';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import Navbar from './site/Navbar';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import Footer from './site/Footer';
import { useTranslations } from 'next-intl';
import { guidePath } from '@/utils/guides/guide-urls';
import { useLandingPage } from '@/hooks/marketing/useLandingPage';
import CtaSection from './landing/CtaSection';
import DemoVideoSection from './landing/DemoVideoSection';
import FaqSection from './landing/FaqSection';
import FeaturesSection from './landing/FeaturesSection';
import LandingHero from './landing/LandingHero';
import LearnSection from './landing/LearnSection';
import PreviewSection from './landing/PreviewSection';
import RelayPulse from '@/assets/illustrations/marketing/RelayPulse';
import RoadmapSection from './landing/RoadmapSection';
import StackSection from './landing/StackSection';
import StepsSection from './landing/StepsSection';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The marketing landing page. Each section is its own component in
 * `./landing/` and owns its scroll reveal; this file keeps the page order
 * and the post-quantum section (whose partner names are the page's two
 * exempt brand strings in the i18n baseline). Going to the app is
 * `useLandingPage`, which never redirects a signed-in visitor on its own.
 */
export default function LandingPage() {
  const t = useTranslations();
  const vm = useLandingPage();

  if (vm.isNavigating) {
    return (
      <div className="h-screen flex items-center justify-center bg-lc-black">
        <Stack gap="3" align="center">
          <div className="lc-spinner" style={{ width: 32, height: 32 }} />
          <span className="text-sm text-lc-muted">{t('common.loading')}</span>
        </Stack>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
      <ShootingStars />
      <div className="relative z-10">
        <Navbar onLoginSuccess={vm.onLoginSuccess} />
        <LandingHero onLaunch={vm.launch} />
        <DemoVideoSection />
        <RelayPulse />
        <PreviewSection onLaunch={vm.launch} />
        <FeaturesSection />
        <StepsSection />
        <RoadmapSection />
        <LearnSection />
        <StackSection />
        <CtaSection onLaunch={vm.launch} />
        <FaqSection />

        {/* Post-quantum messages: joint work with Nostr WoT + QuantaKrypto.
          This copy used to be written as in-development because DMs were still
          NIP-04. That shipped: DMs are gift-wrapped by default and carry a
          post-quantum seal when both sides advertise keys, so `pqc.status` now
          says so. The claim is conditional on purpose: a signer without
          post-quantum support still sends classic NIP-44, and saying otherwise
          would badge an unprotected message as protected. */}
        <PageSection reveal id="post-quantum" className="border-t border-lc-border">
          <Container width="4xl" centeredText>
            <Heading as="h2" variant="section" className="mb-4">
              {t('marketing.pqc.heading')}
            </Heading>
            <Text as="p" variant="lead" className="mb-4">{t('marketing.pqc.subtitle')}</Text>
            <Text as="p" size="sm" className="text-lc-muted/80 mb-12">{t('marketing.pqc.status')}</Text>

            <Text as="p" variant="caption" className="uppercase tracking-widest mb-6">
              {t('marketing.pqc.collab')}
            </Text>
            <div className="grid sm:grid-cols-2 gap-4 text-left">
              {/* Both marks are monochrome white-on-transparent, which is the sanctioned
                on-dark treatment for each brand and keeps the pair visually consistent.
                The QuantaKrypto colour mark is not usable here: one of its nodes is
                #0E1626, which disappears against lc-black. `alt` is empty on purpose:
                the organisation name sits right beside it, so a screen reader would
                otherwise announce it twice. */}
              <Card variant="interactive" padding="2xl" asChild>
                <a
                  href="https://nostr-wot.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:border-lc-green transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Image src="/nostr-wot-logo.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                    <span className="font-semibold">Nostr WoT</span>
                  </div>
                  <span className="block text-sm text-lc-muted">{t('marketing.pqc.nostrwot.desc')}</span>
                </a>
              </Card>
              <Card variant="interactive" padding="2xl" asChild>
                <a
                  href="https://quantakrypto.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:border-lc-green transition-colors"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <Image src="/quantakrypto-mark.svg" alt="" aria-hidden="true" width={36} height={36} className="w-9 h-9 shrink-0" />
                    <span className="font-semibold">QuantaKrypto</span>
                  </div>
                  <span className="block text-sm text-lc-muted">{t('marketing.pqc.quantakrypto.desc')}</span>
                </a>
              </Card>
            </div>
            <div className="mt-10">
              <Link
                href={guidePath('quantum-safe-dms')}
                className="lc-pill lc-pill-secondary text-sm inline-flex items-center gap-2"
              >
                {t('marketing.pqc.guide')} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Container>
        </PageSection>

        <Footer />

        {/* Login modal removed: bridge-backed login lives at /app. */}
      </div>
    </main>
  );
}
