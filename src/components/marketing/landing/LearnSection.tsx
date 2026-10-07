'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { guidePath } from '@/utils/guides/guide-urls';
import Reveal from '@/components/ui/animations/Reveal';
import { LEARN_GUIDES } from '@/constants/marketing/landing';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The guide cards and the link to every guide.
 */
export default function LearnSection() {
  const t = useTranslations();
  return (
    <Reveal id="learn" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <Heading as="h2" variant="section" className="mb-4">
            {t('marketing.learn.heading')}
          </Heading>
          <Text as="p" variant="lead" className="max-w-xl mx-auto">
            {t('marketing.learn.subtitle')}
          </Text>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {LEARN_GUIDES.map((g) => (
            <Link
              key={g.slug}
              href={guidePath(g.slug)}
              className="lc-card p-6 group"
            >
              <Heading as="h3" variant="cardLink">
                {t(`marketing.learn.card.${g.tKey}.title`)}
              </Heading>
              <Text as="p" variant="muted" className="mt-2">
                {t(`marketing.learn.card.${g.tKey}.desc`)}
              </Text>
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
    </Reveal>
  );
}
