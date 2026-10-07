import { describe, it, expect } from 'vitest';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { LocaleProvider } from '@tests/support/intl';
import type { Locale } from '@/i18n';
import ObeliskBotsHero from '@/components/guides/svg/heroes/ObeliskBotsHero';
import { HERO_REGISTRY, SvgHero } from '@/components/guides/svg/index';

/** The artwork's words come from the `guides` messages, so it renders inside a provider. */
const render = (ui: ReactElement, locale: Locale = 'en') =>
  rtlRender(<LocaleProvider initialLocale={locale}>{ui}</LocaleProvider>);

describe('ObeliskBotsHero', () => {
  it('renders the zap bot workflow labels', () => {
    const { container } = render(<ObeliskBotsHero />);
    const text = container.textContent ?? '';
    expect(text).toContain('ZAP BOT');
    expect(text).toContain('kind 9735');
    expect(text).toContain('kind 7 zap');
    expect(text).toContain('kind 9 post');
    expect(text).toContain('NIP-29 scan');
  });

  it('letters the artwork in the page\'s language, protocol terms as they are', () => {
    const { container } = render(<ObeliskBotsHero />, 'es');
    const text = container.textContent ?? '';
    expect(text).toContain('recibo de zap');
    expect(text).toContain('escaneo NIP-29');
    expect(text).toContain('kind 9735');
    expect(text).toContain('ZAP BOT');
    expect(container.querySelector('title')?.textContent).toBe('Obelisk Bots y el zap bot');
  });

  it('exposes an accessible title for screen readers', () => {
    const { container } = render(<ObeliskBotsHero />);
    expect(container.querySelector('title')?.textContent).toMatch(/Obelisk Bots/i);
  });

  it('is registered under the obelisk-bots hero key', () => {
    expect(HERO_REGISTRY['obelisk-bots']).toBe(ObeliskBotsHero);
  });

  it('SvgHero renders the indexable obelisk-bots image', () => {
    const { container } = render(<SvgHero name="obelisk-bots" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('/og/guides/obelisk-bots.png');
    expect(img?.getAttribute('alt')?.toLowerCase()).toContain('zap bot');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
