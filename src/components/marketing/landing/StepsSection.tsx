'use client';

import { useTranslations } from 'next-intl';
import RevealSection from './RevealSection';
import { STEP_ICONS } from './landing-data';
import { ArrowDownIcon } from '@/assets/icons';

/**
 * How it works: three numbered steps with a connector line on desktop.
 */
export default function StepsSection() {
  const t = useTranslations();
  return (
    <RevealSection id="how-it-works" className="py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.steps.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg">{t('marketing.steps.subtitle')}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
          {/* Connector line (desktop only) */}
          <div className="hidden md:block absolute top-12 left-[calc(33.33%+0.75rem)] right-[calc(33.33%+0.75rem)] h-px bg-gradient-to-r from-lc-green/30 via-lc-green/20 to-lc-green/30" />
          {([1, 2, 3] as const).map((num, i) => (
            <div key={num} className="lc-card p-6 relative group">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-lc-green/10 border border-lc-green/30 flex items-center justify-center text-lc-green text-sm font-bold group-hover:bg-lc-green/20 transition-colors">
                  {String(num).padStart(2, '0')}
                </div>
                <div className="w-9 h-9 rounded-lg bg-lc-olive/30 flex items-center justify-center text-lc-green">
                  {STEP_ICONS[i]}
                </div>
              </div>
              <h3 className="text-lg font-semibold text-lc-white mb-2">{t(`marketing.steps.${num}.title`)}</h3>
              <p className="text-sm text-lc-muted leading-relaxed">{t(`marketing.steps.${num}.desc`)}</p>
              {i < 2 && (
                <div className="md:hidden flex justify-center py-2 mt-4 text-lc-green/30">
                  <ArrowDownIcon size={20} strokeWidth={2} strokeLinecap="butt" strokeLinejoin="miter" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </RevealSection>
  );
}
