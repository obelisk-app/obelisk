/**
 * A clean page for the Google Analytics consent tests: no stored answer,
 * no cookies, no gtag script, no `dataLayer`, no opt-out flag, and the
 * consent module's memory forgotten.
 */
import { _resetAnalyticsConsentForTest } from '@/services/analytics/consent';
import { GA_MEASUREMENT_ID, GTAG_SCRIPT_ID } from '@/services/analytics/gtag';

export const DISABLE_FLAG = `ga-disable-${GA_MEASUREMENT_ID}`;

type Win = Window & Record<string, unknown>;

export function resetAnalyticsPage(): void {
  localStorage.clear();
  for (const part of document.cookie.split(';')) {
    const name = part.trim().split('=')[0];
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
  document.querySelectorAll('script').forEach((s) => s.remove());
  const w = window as unknown as Win;
  delete w.dataLayer;
  delete w.gtag;
  delete w[DISABLE_FLAG];
  _resetAnalyticsConsentForTest();
}

/** Every `<script>` on the page that points at Google. */
export function googleScripts(): HTMLScriptElement[] {
  return [...document.querySelectorAll('script')].filter((s) => /google/.test(s.src) || s.id === GTAG_SCRIPT_ID);
}

/** What gtag.js would do on load: write its cookies (only it ever sets them). */
export function simulateGtagCookies(): void {
  document.cookie = '_ga=GA1.1.123.456; Path=/';
  document.cookie = `_ga_${GA_MEASUREMENT_ID.slice(2)}=GS2.1.s1; Path=/`;
}

export function optedOut(): unknown {
  return (window as unknown as Win)[DISABLE_FLAG];
}
