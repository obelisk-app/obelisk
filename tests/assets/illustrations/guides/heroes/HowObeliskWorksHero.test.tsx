import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { LOCALES, type Locale } from '@/i18n';
import HowObeliskWorksHero from '@/assets/illustrations/guides/heroes/HowObeliskWorksHero';
import { snapshotPaths } from '@/utils/guides/asset-meta';

/** Earlier drawings' labels: an Obelisk server in the middle, a server-side profile fetch, the architecture boxes. */
const OLD_LABELS = /Obelisk server<|Servidor Obelisk<|Realtime|Tiempo real|Tempo real|session \+ messages|profile fetch|One connection manager|Un solo gestor de conexiones/;

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('HowObeliskWorksHero', () => {
  it("compares a usual platform's company server with your community's relay", () => {
    const text = render(<HowObeliskWorksHero />).container.textContent ?? '';
    expect(text).toContain('A USUAL CHAT PLATFORM');
    expect(text).toContain("The company's server");
    expect(text).toContain('your account · your data · its rules');
    expect(text).toContain('You, with your key');
    expect(text).toContain('signed message');
    expect(text).toContain("Your community's relay");
  });

  it('says there is no Obelisk server in between', () => {
    const text = render(<HowObeliskWorksHero />).container.textContent ?? '';
    expect(text).not.toMatch(OLD_LABELS);
    expect(text).toContain('There is no Obelisk server in between.');
    expect(text).toContain('No Obelisk server in between.');
  });

  it('draws its labels in the page language', () => {
    const es = render(<HowObeliskWorksHero />, 'es').container.textContent ?? '';
    expect(es).toContain('El relay de tu comunidad');
    expect(es).toContain('Vos, con tu clave');
    const pt = render(<HowObeliskWorksHero />, 'pt').container.textContent ?? '';
    expect(pt).toContain('O relay da sua comunidade');
  });

  it('every language snapshot shows the new drawing', () => {
    const expected: Record<Locale, string> = {
      en: "Your community&apos;s relay",
      es: 'El relay de tu comunidad',
      pt: 'O relay da sua comunidade',
    };
    for (const locale of LOCALES) {
      const svg = readFileSync(join(process.cwd(), 'public', snapshotPaths('how-obelisk-works', locale).svg), 'utf8');
      expect(svg.replace(/&#x27;|&#39;|'/g, '&apos;'), locale).toContain(expected[locale]);
      expect(svg, locale).not.toMatch(OLD_LABELS);
    }
  });
});
