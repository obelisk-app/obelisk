/**
 * Analytics: consent. Values the code in `services/analytics/consent.ts`
 * reads, kept here so every reader imports the one copy.
 */

import type { AnalyticsConsentState } from '@/services/analytics/consent';

export const ANALYTICS_CONSENT_KEY = 'obelisk:analytics-consent';

/** What the server renders and hydration starts from: nothing shown. */
export const UNKNOWN_CONSENT: AnalyticsConsentState = Object.freeze({ known: false, choice: null, reviewing: false });
