'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { guidePath } from '@/utils/guides/guide-urls';
import RevealSection from './RevealSection';
import { LEARN_GUIDES } from './landing-data';

/**
 * The guide cards and the link to every guide.
 */
export default function LearnSection() {
  const t = useTranslations();
  return (
    <RevealSection id="learn" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('marketing.learn.heading')}<span className="text-lc-green">.</span>
          </h2>
          <p className="text-lc-muted text-lg max-w-xl mx-auto">
            {t('marketing.learn.subtitle')}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {LEARN_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={guidePath(g.slug)}
              className="lc-card p-6 group"
            >
              <h3 className="text-lg font-bold text-lc-white group-hover:text-lc-green transition-colors">
                {t(`marketing.learn.card.${g.tKey}.title`)}
              </h3>
              <p className="mt-2 text-sm text-lc-muted">
                {t(`marketing.learn.card.${g.tKey}.desc`)}
              </p>
              <div className="mt-4 text-xs text-lc-green font-semibold">
                {t('marketing.learn.cta')} →
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-10 text-center">
          <Link
            href={guidePath()}
            className="lc-pill lc-pill-secondary text-sm inline-flex items-center gap-2"
          >
            {t('marketing.learn.cta')} <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </RevealSection>
  );
}
