'use client';

import { useTranslations } from 'next-intl';
import YouTubeEmbed from '@/components/common/YouTubeEmbed';
import RevealSection from './RevealSection';
import { DEMO_VIDEO_ID } from './landing-data';

/**
 * Demo video: sits between the hero pitch and the device screenshots
 * so the flow is claim → see it move → see it still. Click-to-play:
 * no YouTube iframe (and no Google cookies) until the visitor asks
 * for it, so the landing page's first paint stays first-party.
 */
export default function DemoVideoSection() {
  const t = useTranslations();
  return (
    <RevealSection id="demo-video" className="pt-10 pb-4 px-6" testId="landing-demo-video">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.landing.video.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-2xl mx-auto">
            {t('marketing.landing.video.subtitle')}
          </p>
        </div>
        <YouTubeEmbed
          videoId={DEMO_VIDEO_ID}
          className="w-full shadow-2xl shadow-black/40"
          title={t('marketing.landing.video.title')}
          thumbnailRes="maxres"
        />
      </div>
    </RevealSection>
  );
}
