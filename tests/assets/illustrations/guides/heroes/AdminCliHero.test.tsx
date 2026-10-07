import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import { LOCALES, type Locale } from '@/i18n';
import AdminCliHero from '@/assets/illustrations/guides/heroes/AdminCliHero';
import ZapFlowDiagram from '@/assets/illustrations/guides/diagrams/ZapFlowDiagram';
import { snapshotPaths } from '@/utils/guides/asset-meta';

const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('AdminCliHero', () => {
  it('shows the in-app admin tools, not the removed command-line tool', () => {
    const text = render(<AdminCliHero />).container.textContent ?? '';
    expect(text).toContain('Server settings');
    expect(text).toContain('Roles & ranks');
    expect(text).toContain('Channel settings');
    expect(text).toContain('NIP-29 relay');
    expect(text).not.toMatch(/npm run admin|terminal|cli\b/i);
  });

  it('draws its labels in the page language', () => {
    const es = render(<AdminCliHero />, 'es').container.textContent ?? '';
    expect(es).toContain('Ajustes del servidor');
    const pt = render(<AdminCliHero />, 'pt').container.textContent ?? '';
    expect(pt).toContain('Configurações do canal');
  });
});

describe('ZapFlowDiagram', () => {
  it('draws the NIP-57 flow with no Obelisk server and no Socket.io', () => {
    const text = render(<ZapFlowDiagram />).container.textContent ?? '';
    expect(text).toContain('kind 9734');
    expect(text).toContain('kind 9735');
    expect(text).toContain('WebLN or NWC');
    expect(text).toContain("Recipient's LNURL server");
    expect(text).not.toMatch(/Obelisk server(?! in the money path)|Socket\.io|\/api\/wallet/);
  });

  it('keeps the old server and Socket.io out of every language snapshot', () => {
    for (const locale of LOCALES) {
      for (const name of ['zap-flow', 'admin-cli']) {
        const svg = readFileSync(join(process.cwd(), 'public', snapshotPaths(name, locale).svg), 'utf8');
        expect(svg, `${locale} ${name}`).not.toMatch(/Socket\.io|\/api\/wallet|npm run admin/);
      }
    }
  });
});
