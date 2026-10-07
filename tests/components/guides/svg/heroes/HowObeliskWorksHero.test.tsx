import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { LOCALES, type Locale } from '@/i18n';
import HowObeliskWorksHero from '@/components/guides/svg/heroes/HowObeliskWorksHero';
import { snapshotPaths } from '@/utils/guides/asset-meta';

/** The old drawing's labels: a server box between client and relays, a session, a server-side profile fetch. */
const OLD_LABELS = /Obelisk server<|Servidor Obelisk<|Realtime|Tiempo real|Tempo real|session \+ messages|sesión \+ mensajes|sessão \+ mensagens|profile fetch|carga de perfiles|busca de perfis/;

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('HowObeliskWorksHero', () => {
  it('draws the server as the NIP-29 relay, with the key, the app and the other relays around it', () => {
    const text = render(<HowObeliskWorksHero />).container.textContent ?? '';
    expect(text).toContain('Your server (a NIP-29 relay)');
    expect(text).toContain('Your key stays with you');
    expect(text).toContain('NIP-46');
    expect(text).toContain('One connection manager');
    expect(text).toContain('signed events');
    expect(text).toContain('Other Nostr relays');
    expect(text).toContain('WebRTC mesh');
    expect(text).toContain('Lightning wallet');
  });

  it('no longer draws an Obelisk server between the app and the relays', () => {
    const text = render(<HowObeliskWorksHero />).container.textContent ?? '';
    expect(text).not.toMatch(OLD_LABELS);
    expect(text).toContain('There is no Obelisk server in between.');
  });

  it('draws its labels in the page language', () => {
    const es = render(<HowObeliskWorksHero />, 'es').container.textContent ?? '';
    expect(es).toContain('Tu servidor (un relay NIP-29)');
    expect(es).toContain('Tu clave se queda con vos');
    const pt = render(<HowObeliskWorksHero />, 'pt').container.textContent ?? '';
    expect(pt).toContain('Seu servidor (um relay NIP-29)');
  });

  it('every language snapshot shows the new drawing', () => {
    const expected: Record<Locale, string> = {
      en: 'Your server (a NIP-29 relay)',
      es: 'Tu servidor (un relay NIP-29)',
      pt: 'Seu servidor (um relay NIP-29)',
    };
    for (const locale of LOCALES) {
      const svg = readFileSync(join(process.cwd(), 'public', snapshotPaths('how-obelisk-works', locale).svg), 'utf8');
      expect(svg, locale).toContain(expected[locale]);
      expect(svg, locale).not.toMatch(OLD_LABELS);
    }
  });
});
