import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import LocalDataHelp from '@/components/help/LocalDataHelp';
import FaqSection from '@/components/marketing/landing/FaqSection';
import { FAQ_IDS } from '@/components/marketing/landing/landing-data';
import { LOCAL_DATA_CATEGORIES } from '@/services/local-data';

vi.mock('@/components/marketing/Navbar', () => ({ default: () => <nav /> }));
vi.mock('@/components/marketing/Footer', () => ({ default: () => <footer /> }));

const LOCALES = ['en', 'es', 'pt'] as const;

describe('the local data help page', () => {
  it.each(LOCALES)('explains what is kept, why, and every way to remove it (%s)', (locale) => {
    const t = translator(locale);
    render(<LocaleProvider initialLocale={locale}><LocalDataHelp /></LocaleProvider>);
    const page = screen.getByTestId('local-data-help');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t('help.localData.title'));
    for (const c of LOCAL_DATA_CATEGORIES) expect(page).toHaveTextContent(t(c.titleKey));
    for (const key of [
      'help.localData.server.body',
      'help.localData.settings.body',
      'help.localData.other.logout',
      'help.localData.other.chrome',
      'help.localData.other.firefox',
      'help.localData.other.safari',
      'help.localData.other.ios',
      'help.localData.other.android',
      'help.localData.other.private',
      'help.localData.published.body',
    ] as const) {
      expect(page).toHaveTextContent(t(key));
    }
    expect(screen.getByRole('link', { name: t('help.localData.back') })).toHaveAttribute(
      'href',
      locale === 'en' ? '/help' : `/${locale}/help`,
    );
  });

  it('says what clearing does not remove, and names the deletion request', () => {
    for (const locale of LOCALES) {
      const body = translator(locale)('help.localData.published.body');
      expect(body).toContain('NIP-09');
      expect(body).toContain('relay');
    }
  });
});

describe('the local data FAQ entry', () => {
  it('is in the FAQ list', () => {
    vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
    expect(FAQ_IDS).toContain('q11');
    render(<LocaleProvider initialLocale="en"><FaqSection /></LocaleProvider>);
    expect(screen.getByTestId('faq-item-q11')).toHaveTextContent(translator('en')('marketing.faq.q11.question'));
    vi.unstubAllGlobals();
  });

  it.each(LOCALES)('points to the settings screen, the browser, private windows and NIP-09 (%s)', (locale) => {
    const t = translator(locale);
    const answer = t('marketing.faq.q11.answer');
    expect(answer).toContain(t('settings.section.data.label'));
    expect(answer).toContain(t('settings.localData.removeAll.title'));
    expect(answer).toContain('obelisk.ar');
    expect(answer).toContain('NIP-09');
    expect(answer).toContain('help/local-data');
  });
});
