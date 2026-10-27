import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { standardPageMetadata } from '@/utils/seo/standard';
import { webApplicationNode } from '@/utils/seo/jsonld';
import ShootingStars from '@/components/ui/animations/ShootingStars';
import CtaSection from '@/components/marketing/landing/CtaSection';
import DemoVideoSection from '@/components/marketing/landing/DemoVideoSection';
import FaqSection from '@/components/marketing/landing/FaqSection';
import FeaturesSection from '@/components/marketing/landing/FeaturesSection';
import LandingHero from '@/components/marketing/landing/LandingHero';
import LearnSection from '@/components/marketing/landing/LearnSection';
import PostQuantumSection from '@/components/marketing/landing/PostQuantumSection';
import ProductStage from '@/components/marketing/landing/ProductStage';
import PreviewSection from '@/components/marketing/landing/PreviewSection';
import RelayPulse from '@/assets/illustrations/marketing/RelayPulse';
import SocialSection from '@/components/marketing/landing/SocialSection';
import StackSection from '@/components/marketing/landing/StackSection';
import StepsSection from '@/components/marketing/landing/StepsSection';
import JsonLd from '@/components/seo/JsonLd';
import { cachedGuideList } from '@/services/guides/cached-guides';

// Sister project (server-backed variant): https://classic.obelisk.ar
// The roadmap (RoadmapSection) is hidden from the landing and the navbar for now; the section is kept.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  return standardPageMetadata(await getTranslations({ locale }), locale, 'landing', { absoluteTitle: true });
}

export default async function Page() {
  const locale = await getLocale();
  const t = await getTranslations({ locale });
  const guides = await cachedGuideList(locale);
  return (
    <>
      <JsonLd data={webApplicationNode(locale, t('seo.site.jsonLd.appDescription'))} />
      <main className="min-h-screen relative">
        <ShootingStars />
        <div className="relative z-10">
          <LandingHero />
          <ProductStage />
          <DemoVideoSection />
          <SocialSection />
          <RelayPulse />
          <PreviewSection />
          <FeaturesSection />
          <StepsSection />
          <LearnSection guides={guides} />
          <StackSection />
          <CtaSection />
          <FaqSection />

          <PostQuantumSection />
        </div>
      </main>
    </>
  );
}
