'use client';

import Card from '@/components/ui/layout/Card';
import { useTranslations } from 'next-intl';
import AnalyticsChoiceButtons from '@/components/analytics/AnalyticsChoiceButtons';
import { useAnalyticsConsent } from '@/hooks/analytics/useAnalyticsConsent';
import { setAnalyticsConsent } from '@/services/analytics/consent';
import Heading from '@/components/ui/layout/Heading';
import Text from '@/components/ui/layout/Text';
import Skeleton from '@/components/ui/animations/Skeleton';

/**
 * Settings > Data on this device: the Analytics answer, changeable at any
 * time. "Don't allow" takes effect at once, without a reload: Google's
 * opt-out flag is set and the `_ga*` cookies are deleted.
 */
export default function AnalyticsSetting() {
  const t = useTranslations();
  const { known, choice } = useAnalyticsConsent();
  const status = choice === 'granted'
    ? t('settings.localData.analytics.granted')
    : choice === 'denied'
      ? t('settings.localData.analytics.denied')
      : t('settings.localData.analytics.unset');
  return (
    <Card as="section" surface="transparent" radius="lg" data-testid="analytics-setting">
      <Heading as="h3" variant="panel">{t('settings.localData.analytics.title')}</Heading>
      {known ? (
        <Text as="p" variant="caption" className="mt-0.5 leading-5" data-testid="analytics-setting-status">{status}</Text>
      ) : (
        <Skeleton variant="pulse" className="mt-1.5 h-3 w-40 rounded bg-lc-border" />
      )}
      <div className="mt-3 sm:max-w-xs">
        <AnalyticsChoiceButtons choice={choice} onChoose={setAnalyticsConsent} testIdPrefix="analytics-setting" />
      </div>
    </Card>
  );
}
