'use client';

import { useTranslations } from 'next-intl';
import AnalyticsChoiceButtons from '@/components/analytics/AnalyticsChoiceButtons';
import { useAnalyticsConsent } from '@/hooks/analytics/useAnalyticsConsent';
import { setAnalyticsConsent } from '@/services/analytics/consent';

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
    <section className="rounded-lg border border-lc-border p-3" data-testid="analytics-setting">
      <h3 className="text-sm font-semibold text-lc-white">{t('settings.localData.analytics.title')}</h3>
      {known ? (
        <p className="mt-0.5 text-xs leading-5 text-lc-muted" data-testid="analytics-setting-status">{status}</p>
      ) : (
        <div className="mt-1.5 h-3 w-40 animate-pulse rounded bg-lc-border" />
      )}
      <div className="mt-3 sm:max-w-xs">
        <AnalyticsChoiceButtons choice={choice} onChoose={setAnalyticsConsent} testIdPrefix="analytics-setting" />
      </div>
    </section>
  );
}
