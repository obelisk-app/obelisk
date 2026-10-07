'use client';

import { useTranslations } from 'next-intl';
import RevealSection from './RevealSection';
import { ROADMAP_PHASES } from './landing-data';
import RoadmapPhase from './RoadmapPhase';

/**
 * The roadmap as a vertical timeline.
 */
export default function RoadmapSection() {
  const t = useTranslations();
  return (
    <RevealSection id="roadmap" className="py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.roadmap.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('marketing.roadmap.subtitle')}
          </p>
        </div>
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-4 md:left-6 top-0 bottom-0 w-px bg-gradient-to-b from-lc-green/40 via-lc-green/20 to-lc-border" />

          <div className="space-y-8">
            {ROADMAP_PHASES.map((phase) => (
              <RoadmapPhase key={phase.key} phase={phase} />
            ))}
          </div>
        </div>
      </div>
    </RevealSection>
  );
}
