'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  applyStoredAnalyticsConsent,
  getAnalyticsConsent,
  subscribeAnalyticsConsent,
  type AnalyticsConsentState,
} from '@/services/analytics/consent';
import { UNKNOWN_CONSENT } from '@/constants/analytics/consent';

/**
 * The Analytics answer, re-rendering on every change. On the server and
 * during hydration it is `UNKNOWN_CONSENT` (`known: false`), so nothing about
 * it is in the first HTML; the browser's answer arrives right after.
 */
export function useAnalyticsConsent(): AnalyticsConsentState {
  return useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => UNKNOWN_CONSENT);
}

/** Once per page: load Google Analytics if, and only if, the stored answer allows it. */
export function useApplyAnalyticsConsent(): void {
  useEffect(() => { applyStoredAnalyticsConsent(); }, []);
}
