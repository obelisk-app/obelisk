'use client';

import { useTranslations } from 'next-intl';
import YouTubeEmbed from '@/components/common/YouTubeEmbed';
import Reveal from '@/components/ui/animations/Reveal';
import { DEMO_VIDEO_ID } from './landing-data';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * Demo video: sits between the hero pitch and the device screenshots
 * so the flow is claim → see it move → see it still. Click-to-play:
 * no YouTube iframe (and no Google cookies) until the visitor asks
 * for it, so the landing page's first paint stays first-party.
 */
export default function DemoVideoSection() {
  const t = useTranslations();
  return (
    <Reveal id="demo-video" className="pt-10 pb-4 px-6" data-testid="landing-demo-video">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.landing.video.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-2xl mx-auto">
            {t('marketing.landing.video.subtitle')}
          </Text>
        </div>
        <YouTubeEmbed
          videoId={DEMO_VIDEO_ID}
          className="w-full shadow-2xl shadow-black/40"
          title={t('marketing.landing.video.title')}
          thumbnailRes="maxres"
        />
      </div>
    </Reveal>
  );
}
