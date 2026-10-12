import { setRootLocale } from '@tests/support/root-params';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider, translator } from '@tests/support/intl';
import Page from '@/app/[locale]/(site)/support/page';
import { LEGAL_VALUES } from '@/constants/legal/contact';
import { SUPPORT_DOCUMENT } from '@/constants/legal/support';

const LOCALES = ['en', 'es', 'pt'] as const;

describe('the support page', () => {
  it.each(LOCALES)('draws its title, its date and every section in the page language (%s)', async (locale) => {
    setRootLocale(locale);
    const t = translator(locale);
    const local = (path: string) => (locale === 'en' ? path : `/${locale}${path}`);
    render(<LocaleProvider initialLocale={locale}>{await Page()}</LocaleProvider>);

    const page = screen.getByTestId('legal-support');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(t(SUPPORT_DOCUMENT.title));
    expect(screen.getByTestId('legal-updated')).toHaveTextContent(t(SUPPORT_DOCUMENT.updated));
    expect(page).toHaveTextContent(t(SUPPORT_DOCUMENT.intro, LEGAL_VALUES));
    for (const section of SUPPORT_DOCUMENT.sections) {
      const block = screen.getByTestId(`legal-section-${section.id}`);
      expect(block).toHaveAttribute('id', section.id);
      for (const key of [section.title, ...(section.body ?? []), ...(section.list ?? []), ...(section.after ?? [])]) {
        expect(block, key).toHaveTextContent(t(key, LEGAL_VALUES));
      }
    }

    const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('mailto:abuse@obelisk.ar');
    expect(hrefs).toContain(local('/help'));
    expect(hrefs).toContain(local('/help/local-data'));
    expect(hrefs).toContain(local('/privacy'));
    expect(hrefs).toContain(local('/terms'));
    expect(hrefs).toContain('https://github.com/obelisk-app/obelisk/issues');
    expect(hrefs).toContain('https://github.com/obelisk-app/obelisk/blob/main/ABUSE.md');
    expect(hrefs).toContain('https://github.com/obelisk-app/obelisk/blob/main/SECURITY.md');
  });
});
