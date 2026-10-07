'use client';

import { useTranslations } from 'next-intl';
import Button from '@/components/ui/buttons/Button';
import Reveal from '@/components/ui/animations/Reveal';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The closing call to action.
 */
export default function CtaSection({ onLaunch }: { onLaunch: () => void }) {
  const t = useTranslations();
  return (
    <Reveal className="py-24 px-6">
      <div className="max-w-3xl mx-auto text-center">
        <div className="lc-card p-12 lc-glow">
          <Heading as="h2" variant="section" accent="?" className="mb-4">
            {t('marketing.cta.heading')}
          </Heading>
          <Text as="p" variant="lead" className="mb-8 max-w-lg mx-auto">
            {t('marketing.cta.subtitle')}
          </Text>
          <Button variant="pill" size="lg" onClick={() => onLaunch()}>
            {t('marketing.cta.button')}
          </Button>
        </div>
      </div>
    </Reveal>
  );
}
