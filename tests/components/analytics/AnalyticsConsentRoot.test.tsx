import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import AnalyticsConsentRoot from '@/components/analytics/AnalyticsConsentRoot';
import { reviewAnalyticsConsent } from '@/services/analytics/consent';
import { ANALYTICS_CONSENT_KEY } from '@/constants/analytics/consent';
import { SCOPES } from '@/i18n/modules';
import { googleScripts, optedOut, resetAnalyticsPage, simulateGtagCookies } from '@tests/support/analytics';

type Locale = 'en' | 'es' | 'pt';

function renderRoot(locale: Locale = 'en') {
  return render(<LocaleProvider initialLocale={locale}><AnalyticsConsentRoot /></LocaleProvider>);
}

beforeEach(resetAnalyticsPage);

describe('the Analytics question on first visit', () => {
  it('is not in the server HTML, and nothing from Google is either', () => {
    const html = renderToString(<LocaleProvider initialLocale="en"><AnalyticsConsentRoot /></LocaleProvider>);
    expect(html).toBe('');
    expect(googleScripts()).toEqual([]);
  });

  it.each(['en', 'es', 'pt'] as const)('says what Google receives and offers two equal answers (%s)', (locale) => {
    const t = translator(locale);
    renderRoot(locale);
    const banner = screen.getByTestId('analytics-consent');
    expect(banner).toHaveTextContent(t('common.analyticsConsent.title'));
    expect(screen.getByTestId('analytics-consent-body')).toHaveTextContent(t('common.analyticsConsent.body'));
    const allow = screen.getByTestId('analytics-consent-granted');
    const decline = screen.getByTestId('analytics-consent-denied');
    expect(allow).toHaveTextContent(t('common.analyticsConsent.allow'));
    expect(decline).toHaveTextContent(t('common.analyticsConsent.decline'));
    // Declining is exactly as easy as accepting: same element, same look.
    expect(allow.tagName).toBe(decline.tagName);
    expect(allow.className).toBe(decline.className);
    expect(allow).not.toHaveAttribute('aria-pressed');
    // Nothing loaded while the question is open.
    expect(googleScripts()).toEqual([]);
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('names the pages, the relay and channel, the device cookie and the location in every language', () => {
    const words: Record<Locale, RegExp[]> = {
      en: [/pages you visit/, /relay and channel/, /cookie/, /IP address/, /only used to see how Obelisk is used/],
      es: [/páginas que visitás/, /relay y en qué canal/, /cookie/, /dirección IP/, /Solo se usa/],
      pt: [/páginas que você visita/, /relay e em qual canal/, /cookie/, /endereço IP/, /só para ver/],
    };
    for (const locale of ['en', 'es', 'pt'] as const) {
      const body = translator(locale)('common.analyticsConsent.body');
      for (const re of words[locale]) expect(body, `${locale}: ${re}`).toMatch(re);
    }
  });

  it('is shipped on every route: the banner reads only `common`, which every scope carries', () => {
    for (const [scope, modules] of Object.entries(SCOPES)) {
      expect(modules as readonly string[], scope).toContain('common');
    }
  });
});

describe('answering', () => {
  it('decline hides the question, stores the answer and loads nothing', () => {
    renderRoot();
    fireEvent.click(screen.getByTestId('analytics-consent-denied'));
    expect(screen.queryByTestId('analytics-consent')).toBeNull();
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
    expect(googleScripts()).toEqual([]);
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('allow hides the question and loads gtag.js exactly once', () => {
    renderRoot();
    fireEvent.click(screen.getByTestId('analytics-consent-granted'));
    expect(screen.queryByTestId('analytics-consent')).toBeNull();
    expect(googleScripts()).toHaveLength(1);
  });

  it('on a later page an allowed answer loads gtag.js once and asks nothing', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
    renderRoot();
    expect(screen.queryByTestId('analytics-consent')).toBeNull();
    expect(googleScripts()).toHaveLength(1);
  });

  it('on a later page a declined answer loads nothing and asks nothing', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
    renderRoot();
    expect(screen.queryByTestId('analytics-consent')).toBeNull();
    expect(googleScripts()).toEqual([]);
  });

  it('the question can be reopened, shows the current answer, and switching to decline stops Analytics at once', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
    renderRoot();
    simulateGtagCookies();
    act(() => reviewAnalyticsConsent());
    expect(screen.getByTestId('analytics-consent-current')).toHaveTextContent('Right now: allowed.');
    expect(screen.getByTestId('analytics-consent-granted')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('analytics-consent-denied'));
    expect(screen.queryByTestId('analytics-consent')).toBeNull();
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(googleScripts()).toHaveLength(1); // the loaded script stays, silenced by the opt-out
  });
});
