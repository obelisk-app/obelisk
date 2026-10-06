'use client';

import { useTranslation } from '@/i18n/context';
import Button from '@/components/ui/Button';
import RevealSection from './RevealSection';

/**
 * The closing call to action.
 */
export default function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  const { t } = useTranslation();
  return (
    <RevealSection className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="lc-card p-12 lc-glow">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            {t('cta.heading')}<span className="text-lc-green">?</span>
          </h2>
          <p className="text-lc-muted text-lg mb-8 max-w-lg mx-auto">
            {t('cta.subtitle')}
          </p>
          <Button variant="pill" size="lg" onClick={() => onLaunch()}>
            {t('cta.button')}
          </Button>
        </div>
      </div>
    </RevealSection>
  );
}
