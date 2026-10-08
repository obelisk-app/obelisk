import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import IntlScope from '@/i18n/IntlScope';
import { standardPageMetadata } from '@/utils/seo/standard';
import { webApplicationNode } from '@/utils/seo/jsonld';
import Navbar from '@/components/marketing/site/Navbar';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import Footer from '@/components/marketing/site/Footer';
import CtaSection from '@/components/marketing/landing/CtaSection';
import DemoVideoSection from '@/components/marketing/landing/DemoVideoSection';
import FaqSection from '@/components/marketing/landing/FaqSection';
import FeaturesSection from '@/components/marketing/landing/FeaturesSection';
import LandingHero from '@/components/marketing/landing/LandingHero';
import LearnSection from '@/components/marketing/landing/LearnSection';
import PostQuantumSection from '@/components/marketing/landing/PostQuantumSection';
import PreviewSection from '@/components/marketing/landing/PreviewSection';
import RelayPulse from '@/assets/illustrations/marketing/RelayPulse';
import RoadmapSection from '@/components/marketing/landing/RoadmapSection';
import StackSection from '@/components/marketing/landing/StackSection';
import StepsSection from '@/components/marketing/landing/StepsSection';
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

          <PostQuantumSection />

          <Footer />

        </div>
      </main>
    </IntlScope>
  );
}
