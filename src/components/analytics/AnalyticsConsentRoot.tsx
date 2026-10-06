'use client';

import { useAnalyticsConsent, useApplyAnalyticsConsent } from '@/hooks/analytics/useAnalyticsConsent';
import ConsentBanner from './ConsentBanner';

/**
 * Mounted once in the root layout, on every page. It loads Google
 * Analytics only when this browser's stored answer allows it, and shows
 * the question when there is no answer yet (or the person asked to see it
 * again). On the server it renders nothing, so the first HTML of every page
 * carries no Google script and no banner.
 */
export default function AnalyticsConsentRoot() {
  useApplyAnalyticsConsent();
  const consent = useAnalyticsConsent();
  if (!consent.known) return null;
  if (consent.choice !== null && !consent.reviewing) return null;
  return <ConsentBanner choice={consent.choice} />;
}
