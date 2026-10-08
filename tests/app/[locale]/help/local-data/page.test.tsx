import { setRootLocale } from '@tests/support/root-params';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import LocalDataHelp from '@/app/[locale]/help/local-data/page';
import FaqSection from '@/components/marketing/landing/FaqSection';
import { FAQ_IDS } from '@/constants/marketing/landing';
import { LOCAL_DATA_CATEGORIES } from '@/constants/local-data/categories';

vi.mock('@/components/marketing/site/Navbar', () => ({ default: () => <nav /> }));
vi.mock('@/components/marketing/site/Footer', () => ({ default: () => <footer /> }));

const LOCALES = ['en', 'es', 'pt'] as const;

describe('the local data help page', () => {
  it.each(LOCALES)('explains what is kept, why, and every way to remove it (%s)', async (locale) => {
    setRootLocale(locale);
    const t = translator(locale);
    render(<LocaleProvider initialLocale={locale}>{await LocalDataHelp()}</LocaleProvider>);
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

describe('what the help and FAQ say about Google Analytics', () => {
  const OLD: Record<(typeof LOCALES)[number], RegExp> = {
    en: /come back on the next page load|set again the next time/i,
    es: /vuelven en la próxima carga|se vuelven a poner/i,
    pt: /voltam no próximo carregamento|eles voltam da próxima vez/i,
  };
  const ONLY_IF: Record<(typeof LOCALES)[number], RegExp> = {
    en: /only if you/i,
    es: /solo si/i,
    pt: /só se você/i,
  };

  it.each(LOCALES)('says it loads only if you allow it, and no longer that its cookies come back (%s)', (locale) => {
    const t = translator(locale);
    const texts = [
      t('help.localData.server.body'),
      t('help.localData.categories.analytics.title'),
      t('help.localData.categories.analytics.purpose'),
      t('settings.localData.confirm.analytics'),
      t('marketing.faq.q11.answer'),
    ];
    for (const text of texts) expect(text).not.toMatch(OLD[locale]);
    expect(t('help.localData.server.body')).toMatch(ONLY_IF[locale]);
    expect(t('help.localData.categories.analytics.title')).toMatch(ONLY_IF[locale]);
    expect(t('marketing.faq.q11.answer')).toContain('Google Analytics');
    // Where to change the answer: the settings screen, by its own name.
    expect(t('help.localData.categories.analytics.purpose')).toContain(t('settings.section.data.label'));
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

describe('what the help and FAQ say about direct messages', () => {
  const WORDS = {
    en: { dm: 'direct message', dms: 'direct messages', once: 'once per visit', encrypted: 'encrypted' },
    es: { dm: 'mensaje directo', dms: 'mensajes directos', once: 'una vez por visita', encrypted: 'cifrad' },
    pt: { dm: 'mensagem direta', dms: 'mensagens diretas', once: 'uma vez por visita', encrypted: 'criptografad' },
  } as const;

  it.each(LOCALES)('names the encrypted DM store, its signer unlock, and drops the old preview disclosure (%s)', (locale) => {
    const t = translator(locale);
    const w = WORDS[locale];
    const purpose = t('help.localData.categories.dmMessages.purpose');
    expect(purpose.toLowerCase()).toContain(w.dms);
    expect(purpose).toContain(w.once);
    expect(purpose).toContain('relays');
    // A DM alert keeps who and when, not the text.
    expect(t('help.localData.categories.readState.purpose').toLowerCase()).toContain(w.dm);
    expect(t('help.localData.categories.dms.purpose')).toContain(t('help.localData.categories.dmMessages.title'));
    expect(t('help.localData.other.logout').toLowerCase()).toContain(w.dms);
    expect(t('marketing.faq.q11.answer').toLowerCase()).toContain(w.dms);
    expect(t('marketing.faq.q11.answer')).toContain(w.encrypted);
    expect(t('settings.localData.confirm.dmMessages')).toContain('relays');
  });
});
