'use client';

import { useTranslation } from '@/i18n/context';
import RevealSection from './RevealSection';
import { FEATURE_KEYS } from './landing-data';

/**
 * The feature grid.
 */
export default function FeaturesSection() {
  const { t } = useTranslation();
  return (
    <RevealSection id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('features.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('features.subtitle')}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_KEYS.map((f) => (
            <div key={f.titleKey} className="lc-card p-6 group">
              <div className="w-12 h-12 rounded-xl bg-lc-olive/50 flex items-center justify-center text-lc-green mb-4 group-hover:bg-lc-olive transition-colors">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-lc-white mb-2">{t(f.titleKey)}</h3>
              <p className="text-sm text-lc-muted leading-relaxed">{t(f.descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
