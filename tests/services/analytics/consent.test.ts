import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANALYTICS_CONSENT_KEY,
  applyStoredAnalyticsConsent,
  forgetAnalyticsConsent,
  getAnalyticsConsent,
  reviewAnalyticsConsent,
  setAnalyticsConsent,
  subscribeAnalyticsConsent,
} from '@/services/analytics/consent';
import { entryForKey } from '@/services/local-data';
import { googleScripts, optedOut, resetAnalyticsPage, simulateGtagCookies } from '@tests/support/analytics';

beforeEach(resetAnalyticsPage);

describe('before an answer', () => {
  it('reads no answer, and the page start loads nothing from Google and writes no cookie', () => {
    expect(getAnalyticsConsent()).toEqual({ known: true, choice: null, reviewing: false });
    applyStoredAnalyticsConsent();
    expect(googleScripts()).toEqual([]);
    expect(document.cookie).not.toMatch(/_ga/);
    expect((window as unknown as { dataLayer?: unknown }).dataLayer).toBeUndefined();
  });

  it('deletes _ga cookies left by the builds that loaded Analytics without asking', () => {
    simulateGtagCookies();
    document.cookie = 'locale=es; Path=/';
    applyStoredAnalyticsConsent();
    expect(document.cookie).toBe('locale=es');
    expect(googleScripts()).toEqual([]);
  });

  it('ignores a stored value that is not an answer', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'yes please');
    applyStoredAnalyticsConsent();
    expect(getAnalyticsConsent().choice).toBeNull();
    expect(googleScripts()).toEqual([]);
  });
});

describe('a stored answer, on the next page', () => {
  it('declined: nothing from Google loads', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
    applyStoredAnalyticsConsent();
    expect(getAnalyticsConsent().choice).toBe('denied');
    expect(googleScripts()).toEqual([]);
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('allowed: gtag.js loads once', () => {
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'granted');
    applyStoredAnalyticsConsent();
    applyStoredAnalyticsConsent();
    expect(googleScripts()).toHaveLength(1);
  });
});

describe('answering and changing the answer', () => {
  it('allow saves the answer and loads gtag.js once', () => {
    const listener = vi.fn();
    const off = subscribeAnalyticsConsent(listener);
    setAnalyticsConsent('granted');
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('granted');
    expect(googleScripts()).toHaveLength(1);
    expect(listener).toHaveBeenCalled();
    off();
  });

  it('decline saves the answer and loads nothing', () => {
    setAnalyticsConsent('denied');
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBe('denied');
    expect(googleScripts()).toEqual([]);
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('changing to decline stops Analytics on this page and deletes its cookies, without a reload', () => {
    setAnalyticsConsent('granted');
    simulateGtagCookies();
    setAnalyticsConsent('denied');
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    expect(getAnalyticsConsent()).toMatchObject({ choice: 'denied', reviewing: false });
  });

  it('reviewing reopens the question, and answering closes it', () => {
    setAnalyticsConsent('denied');
    reviewAnalyticsConsent();
    expect(getAnalyticsConsent()).toMatchObject({ choice: 'denied', reviewing: true });
    setAnalyticsConsent('denied');
    expect(getAnalyticsConsent().reviewing).toBe(false);
  });

  it('forgetting removes the answer, stops Analytics and asks again', () => {
    setAnalyticsConsent('granted');
    simulateGtagCookies();
    forgetAnalyticsConsent();
    expect(localStorage.getItem(ANALYTICS_CONSENT_KEY)).toBeNull();
    expect(getAnalyticsConsent().choice).toBeNull();
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
  });

  it('follows an answer given in another tab', () => {
    const off = subscribeAnalyticsConsent(() => {});
    setAnalyticsConsent('granted');
    simulateGtagCookies();
    localStorage.setItem(ANALYTICS_CONSENT_KEY, 'denied');
    window.dispatchEvent(new StorageEvent('storage', { key: ANALYTICS_CONSENT_KEY }));
    expect(getAnalyticsConsent().choice).toBe('denied');
    expect(optedOut()).toBe(true);
    expect(document.cookie).not.toMatch(/_ga/);
    off();
  });

  it('is listed in the local-data inventory under Analytics', () => {
    expect(entryForKey('localStorage', ANALYTICS_CONSENT_KEY)?.category).toBe('analytics');
    expect(entryForKey('cookie', '_ga')?.category).toBe('analytics');
    expect(entryForKey('cookie', '_ga_BZ4NB66WY0')?.category).toBe('analytics');
  });
});
