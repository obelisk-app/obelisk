import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import AnalyticsSetting from '@/components/settings/privacy/AnalyticsSetting';
import LocalDataPanel from '@/components/settings/privacy/LocalDataPanel';
import { ANALYTICS_CONSENT_KEY } from '@/services/analytics/consent';
import { googleScripts, optedOut, resetAnalyticsPage, simulateGtagCookies } from '@tests/support/analytics';

beforeEach(resetAnalyticsPage);

function renderSetting(locale: 'en' | 'es' | 'pt' = 'en') {
  return render(<LocaleProvider initialLocale={locale}><AnalyticsSetting /></LocaleProvider>);
}

describe('Settings > Data on this device: Google Analytics', () => {
  it('is part of the panel', () => {
    render(<LocaleProvider initialLocale="en"><LocalDataPanel /></LocaleProvider>);
    expect(screen.getByTestId('analytics-setting')).toBeInTheDocument();
  });

  it.each(['en', 'es', 'pt'] as const)('says there is no answer yet, and nothing loads (%s)', (locale) => {
    renderSetting(locale);
    expect(screen.getByTestId('analytics-setting-status')).toHaveTextContent(translator(locale)('settings.localData.analytics.unset'));
    expect(googleScripts()).toEqual([]);
  });

  it('allowing loads gtag.js once and says so', () => {
    renderSetting();
    fireEvent.click(screen.getByTestId('analytics-setting-granted'));
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted');
    expect(googleScripts()).toHaveLength(1);
    expect(screen.getByTestId('analytics-setting-status')).toHaveTextContent(translator('en')('settings.localData.analytics.granted'));
    expect(screen.getByTestId('analytics-setting-granted')).toHaveAttribute('aria-pressed', 'true');
  });

  it('changing to "don\'t allow" stops it on this page and deletes the cookies, with no reload', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
    renderSetting();
    fireEvent.click(screen.getByTestId('analytics-setting-granted'));
    simulateGtagCookies();
    fireEvent.click(screen.getByTestId('analytics-setting-denied'));
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(screen.getByTestId('analytics-setting-status')).toHaveTextContent(translator('en')('settings.localData.analytics.denied'));
    expect(screen.getByTestId('analytics-setting-denied')).toHaveAttribute('aria-pressed', 'true');
  });
});
