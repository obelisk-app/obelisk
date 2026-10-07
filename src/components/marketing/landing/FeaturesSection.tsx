'use client';

import { useTranslations } from 'next-intl';
import Reveal from '@/components/ui/animations/Reveal';
import { FEATURE_KEYS } from './landing-data';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The feature grid.
 */
export default function FeaturesSection() {
  const t = useTranslations();
  return (
    <Reveal id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.features.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.features.subtitle')}
          </Text>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_KEYS.map((f) => (
            <div key={f.titleKey} className="lc-card p-6 group">
              <div className="w-12 h-12 rounded-xl bg-lc-olive/50 flex items-center justify-center text-lc-green mb-4 group-hover:bg-lc-olive transition-colors">
                {f.icon}
              </div>
              <Heading as="h3" variant="card" className="mb-2">{t(f.titleKey)}</Heading>
              <Text as="p" variant="muted" className="leading-relaxed">{t(f.descKey)}</Text>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
