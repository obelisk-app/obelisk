import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { standardPageMetadata } from '@/utils/seo/standard';
import { webApplicationNode } from '@/utils/seo/jsonld';
import PageSection from '@/components/ui/layout/PageSection';
import Container from '@/components/ui/layout/Container';
import Card from '@/components/ui/layout/Card';
import { Link } from '@/i18n/navigation';
import Image from 'next/image';
import Navbar from '@/components/marketing/site/Navbar';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import Footer from '@/components/marketing/site/Footer';
import { guidePath } from '@/utils/guides/guide-urls';
import CtaSection from '@/components/marketing/landing/CtaSection';
import DemoVideoSection from '@/components/marketing/landing/DemoVideoSection';
import FaqSection from '@/components/marketing/landing/FaqSection';
import FeaturesSection from '@/components/marketing/landing/FeaturesSection';
import LandingHero from '@/components/marketing/landing/LandingHero';
import LearnSection from '@/components/marketing/landing/LearnSection';
import PreviewSection from '@/components/marketing/landing/PreviewSection';
import RelayPulse from '@/assets/illustrations/marketing/RelayPulse';
import RoadmapSection from '@/components/marketing/landing/RoadmapSection';
import StackSection from '@/components/marketing/landing/StackSection';
import StepsSection from '@/components/marketing/landing/StepsSection';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import JsonLd from '@/components/seo/JsonLd';

// Sister project (server-backed variant): https://classic.obelisk.ar

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'landing', { absoluteTitle: true });
}

export default async function Page() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  return (
    <IntlScope scope="public">
      <JsonLd data={webApplicationNode(locale, t('seo.site.jsonLd.appDescription'))} />
      <main className="min-h-screen bg-lc-black appearance-bg lc-grid-bg relative">
        <ShootingStars />
        <div className="relative z-10">
          <Navbar />
          <LandingHero />
          <DemoVideoSection />
          <RelayPulse />
          <PreviewSection />
          <FeaturesSection />
          <StepsSection />
          <RoadmapSection />
          <LearnSection />
          <StackSection />
          <CtaSection />
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

        </div>
      </main>
    </IntlScope>
  );
}
