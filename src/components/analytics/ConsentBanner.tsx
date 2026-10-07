'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { setAnalyticsConsent, type AnalyticsChoice } from '@/services/analytics/consent';
import AnalyticsChoiceButtons from './AnalyticsChoiceButtons';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';

/**
 * The Analytics question: a small card in a bottom corner, over the page
 * but not blocking it. It says what Google would receive, what for, and
 * offers two equal answers. While unanswered nothing from Google loads, so
 * ignoring it is the same as declining for now.
 *
 * It sits above the login widget's overlay (`.nui-modal-overlay`, z 9999),
 * which is the first thing `/app` shows: under it the question would be
 * invisible on the very page it matters most.
 */
export default function ConsentBanner({ choice }: { choice: AnalyticsChoice | null }) {
  const t = useTranslations();
  return (
    <section
      role="region"
      aria-labelledby="analytics-consent-title"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[10000] rounded-xl border border-lc-border bg-lc-card p-4 text-sm leading-6 text-lc-white shadow-2xl sm:right-auto sm:max-w-md"
      data-testid="analytics-consent"
    >
      <Heading as="h2" id="analytics-consent-title" className="font-semibold">{t('common.analyticsConsent.title')}</Heading>
      <Text as="p" className="mt-1 text-lc-white/85" data-testid="analytics-consent-body">{t('common.analyticsConsent.body')}</Text>
      {choice && (
        <Text as="p" className="mt-1 text-lc-white/85" data-testid="analytics-consent-current">
          {choice === 'granted' ? t('common.analyticsConsent.currentGranted') : t('common.analyticsConsent.currentDenied')}
        </Text>
      )}
      <div className="mt-3">
        <AnalyticsChoiceButtons choice={choice} onChoose={setAnalyticsConsent} testIdPrefix="analytics-consent" />
      </div>
      <Link href="/help/local-data" className="mt-2 inline-block text-xs text-lc-green hover:underline" data-testid="analytics-consent-more">
        {t('common.analyticsConsent.more')}
      </Link>
    </section>
  );
}
